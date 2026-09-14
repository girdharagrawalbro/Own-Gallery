package com.app.backup

import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.Executors

/**
 * Bridge to the native media transfer code.
 * - Auto Backup: stores settings/credentials and (re)schedules WorkManager; the backup work itself
 *   runs in [BackupWorker], never in this module.
 * - Manual uploads: chunked uploads for files the user picked while the app is open.
 */
class MediaSyncModule(reactContext: ReactApplicationContext) : NativeMediaSyncSpec(reactContext) {

  private val context = reactContext.applicationContext
  private val prefs = BackupPreferences(context)

  override fun configure(apiBaseUrl: String) {
    prefs.setApiBaseUrl(apiBaseUrl)
  }

  override fun setAuthTokens(accessToken: String, refreshToken: String) {
    val hadCredentials = prefs.hasCredentials
    prefs.setTokens(accessToken, refreshToken)
    // Signing in again resumes a backup that was enabled before.
    if (!hadCredentials) background { BackupScheduler.apply(context, settingsChanged = false) }
  }

  override fun clearAuth(promise: Promise) = background(promise) {
    prefs.clearTokens()
    BackupScheduler.cancelAll(context)
    // The next account may be different: forget what was backed up for this one.
    BackupLedger.get(context).clear()
    null
  }

  override fun setSettings(enabled: Boolean, wifiOnly: Boolean, chargingOnly: Boolean, promise: Promise) =
    background(promise) {
      prefs.setSettings(enabled, wifiOnly, chargingOnly)
      BackupScheduler.apply(context, settingsChanged = true)
      null
    }

  override fun getStatus(promise: Promise) = background(promise) {
    val states = if (prefs.enabled && prefs.hasCredentials) BackupScheduler.workStates(context) else emptyMap()
    val ledger = BackupLedger.get(context)
    Arguments.createMap().apply {
      putBoolean("enabled", prefs.enabled)
      putBoolean("wifiOnly", prefs.wifiOnly)
      putBoolean("chargingOnly", prefs.chargingOnly)
      putBoolean("signedIn", prefs.hasCredentials)
      putBoolean("permissionGranted", MediaPermissions.canRead(context))
      putString(
        "state",
        when {
          states.values.contains("running") -> "running"
          states.values.contains("scheduled") -> "scheduled"
          else -> "off"
        },
      )
      putDouble("lastRunAt", prefs.lastRunAt.toDouble())
      putDouble("lastSuccessAt", prefs.lastSuccessAt.toDouble())
      putString("lastResult", prefs.lastResult)
      putString("lastError", prefs.lastError)
      putDouble("backedUpCount", ledger.count(BackupLedger.STATE_DONE).toDouble())
      putDouble("skippedCount", ledger.count(BackupLedger.STATE_SKIPPED).toDouble())
    }
  }

  override fun runNow(promise: Promise) = background(promise) {
    BackupScheduler.runNow(context)
    null
  }

  override fun uploadFile(
    taskId: String,
    uri: String,
    fileName: String,
    mimeType: String,
    clientTimestamp: String,
    promise: Promise,
  ) {
    uploader.upload(
      taskId = taskId,
      uri = Uri.parse(uri),
      fileName = fileName,
      mimeType = mimeType,
      clientTimestamp = clientTimestamp,
      onDone = { json -> promise.resolve(json) },
      onError = { error ->
        val code = when (error) {
          is kotlinx.coroutines.CancellationException -> "UPLOAD_CANCELLED"
          is RejectedFileException -> "UPLOAD_REJECTED"
          is AuthRequiredException -> "AUTH_REQUIRED"
          else -> "UPLOAD_FAILED"
        }
        promise.reject(code, error.message ?: "Upload failed", error)
      },
    )
  }

  override fun cancelUpload(taskId: String) {
    uploader.cancel(taskId)
  }

  override fun invalidate() {
    uploader.shutdown()
    executor.shutdown()
    super.invalidate()
  }

  private val uploader = ManualUploader(context, prefs) { taskId, loaded, total ->
    reactApplicationContext.emitDeviceEvent(
      PROGRESS_EVENT,
      Arguments.createMap().apply {
        putString("taskId", taskId)
        putDouble("loaded", loaded.toDouble())
        putDouble("total", total.toDouble())
      },
    )
  }

  // Disk and WorkManager queries stay off the JS thread.
  private val executor = Executors.newSingleThreadExecutor()

  private fun background(block: () -> Unit) {
    executor.execute(block)
  }

  companion object {
    const val PROGRESS_EVENT = "OwnGalleryUploadProgress"
  }

  private fun background(promise: Promise, block: () -> Any?) {
    executor.execute {
      try {
        promise.resolve(block())
      } catch (e: Exception) {
        promise.reject("AUTO_BACKUP_ERROR", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }
}
