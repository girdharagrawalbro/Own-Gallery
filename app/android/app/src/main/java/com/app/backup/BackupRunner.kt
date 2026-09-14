package com.app.backup

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.util.Log
import java.io.IOException
import java.security.MessageDigest

/**
 * One backup pass: find media that isn't backed up, skip what the server already has, and upload
 * the rest with resumable chunked uploads. Progress is saved after every chunk, so a pass that is
 * stopped (constraints lost, cancelled, time budget reached) resumes where it left off next time.
 */
class BackupRunner(
  private val context: Context,
  private val prefs: BackupPreferences,
  private val ledger: BackupLedger,
  private val api: BackupApi,
  private val scanner: MediaScanner = MediaScanner(context),
) {

  sealed class Outcome {
    data class Finished(val uploaded: Int, val alreadyBackedUp: Int, val skipped: Int) : Outcome()
    /** Stopped early (time budget or conditions no longer met); more items remain. */
    data class Paused(val uploaded: Int, val reason: String) : Outcome()
  }

  suspend fun run(deadlineMillis: Long): Outcome {
    val pending = scanner.pendingItems(ledger.finishedVersions())
    Log.i(TAG, "Backup pass: ${pending.size} item(s) not backed up yet")

    var uploaded = 0
    var alreadyBackedUp = 0
    var skipped = 0

    for (batch in pending.chunked(HASH_BATCH)) {
      // Hash the batch, then ask the server which files it already stores.
      val hashed = LinkedHashMap<MediaItem, String>()
      for (item in batch) {
        conditionsBlocking()?.let { return Outcome.Paused(uploaded, it) }
        if (System.currentTimeMillis() > deadlineMillis) return Outcome.Paused(uploaded, "time budget reached")
        val hash = try {
          cachedHash(item) ?: sha256(item).also { ledger.saveHash(item, it) }
        } catch (e: IOException) {
          Log.w(TAG, "Can't read ${item.displayName}; skipping this pass", e)
          continue
        } catch (e: SecurityException) {
          Log.w(TAG, "No access to ${item.displayName}", e)
          continue
        }
        hashed[item] = hash
      }
      if (hashed.isEmpty()) continue

      val existing = api.checkHashes(hashed.values.distinct())
      for ((item, hash) in hashed) {
        if (hash in existing) {
          ledger.entryUploadId(item)?.let { api.cancelSession(it) }
          ledger.markDone(item, hash, null)
          alreadyBackedUp++
        }
      }

      for ((item, hash) in hashed) {
        if (hash in existing) continue
        conditionsBlocking()?.let { return Outcome.Paused(uploaded, it) }
        if (System.currentTimeMillis() > deadlineMillis) return Outcome.Paused(uploaded, "time budget reached")
        try {
          uploadItem(item, hash)
          uploaded++
        } catch (e: RejectedFileException) {
          Log.w(TAG, "Server rejected ${item.displayName}: ${e.message}")
          ledger.markSkipped(item, e.message ?: "Rejected")
          skipped++
        } catch (e: FileChangedException) {
          Log.i(TAG, "${item.displayName} changed while uploading; will retry next pass")
          ledger.clearSession(item)
        } catch (e: PausedException) {
          return Outcome.Paused(uploaded, e.reason)
        }
      }
    }
    return Outcome.Finished(uploaded, alreadyBackedUp, skipped)
  }

  private fun cachedHash(item: MediaItem): String? =
    ledger.get(item.id)?.takeIf { it.matches(item) }?.sha256

  private suspend fun uploadItem(item: MediaItem, hash: String) {
    val entry = ledger.get(item.id)?.takeIf { it.matches(item) && it.sha256 == hash }
    var session = entry?.uploadId?.let { UploadSession(it, entry.chunkSize, entry.totalChunks) }
    var nextChunk = entry?.nextChunk ?: 0

    repeat(3) { attempt ->
      if (session == null) {
        session = api.createSession(item)
        nextChunk = 0
        ledger.saveProgress(item, hash, session!!.uploadId, 0, session!!.chunkSize, session!!.totalChunks)
      }
      val current = session!!
      try {
        sendChunks(item, hash, current, nextChunk)
        var missingRounds = 0
        while (true) {
          when (val result = api.complete(current.uploadId)) {
            is CompleteResult.Created -> {
              ledger.markDone(item, hash, result.mediaId)
              Log.i(TAG, "Backed up ${item.displayName} as media ${result.mediaId}")
              return
            }
            is CompleteResult.MissingChunks -> {
              if (++missingRounds > 2) throw TransientBackupException("Server kept reporting missing chunks")
              for (index in result.chunks.sorted()) sendChunk(item, current, index)
            }
          }
        }
      } catch (e: SessionExpiredException) {
        Log.i(TAG, "Upload session for ${item.displayName} expired (attempt ${attempt + 1}); restarting")
        ledger.clearSession(item)
        session = null
      }
    }
    throw TransientBackupException("Could not upload ${item.displayName}")
  }

  private suspend fun sendChunks(item: MediaItem, hash: String, session: UploadSession, from: Int) {
    for (index in from until session.totalChunks) {
      sendChunk(item, session, index)
      ledger.saveProgress(item, hash, session.uploadId, index + 1, session.chunkSize, session.totalChunks)
      conditionsBlocking()?.let { throw PausedException(it) }
    }
  }

  private suspend fun sendChunk(item: MediaItem, session: UploadSession, index: Int) {
    val offset = index * session.chunkSize
    val length = minOf(session.chunkSize, item.size - offset).toInt()
    val buffer = ChunkReader.read(context, scanner.readableUri(item), offset, length, item.size)
      ?: throw FileChangedException()
    api.putChunk(session.uploadId, index, buffer, length)
  }

  private fun sha256(item: MediaItem): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(256 * 1024)
    context.contentResolver.openInputStream(scanner.readableUri(item)).use { input ->
      input ?: throw IOException("Can't open ${item.displayName}")
      while (true) {
        val n = input.read(buffer)
        if (n < 0) break
        digest.update(buffer, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  /**
   * WorkManager constraints are only evaluated when a run starts; re-check them between items and
   * chunks so turning on "Wi-Fi only" or unplugging the charger takes effect mid-run.
   */
  private fun conditionsBlocking(): String? {
    if (!prefs.enabled) return "backup disabled"
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
      ?: return "no network"
    if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return "no internet"
    if (prefs.wifiOnly && !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) {
      return "waiting for Wi-Fi"
    }
    if (prefs.chargingOnly && !isCharging()) return "waiting for charger"
    return null
  }

  private fun isCharging(): Boolean {
    val battery = context.getSystemService(BatteryManager::class.java)
    if (battery.isCharging) return true
    val status = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val plugged = status?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
    return plugged != 0
  }

  private fun BackupLedger.entryUploadId(item: MediaItem): String? = get(item.id)?.takeIf { it.matches(item) }?.uploadId

  class FileChangedException : Exception()
  class PausedException(val reason: String) : Exception(reason)

  companion object {
    private const val TAG = "OwnGalleryBackup"
    private const val HASH_BATCH = 25
  }
}
