package com.app.backup

import android.content.Context
import android.net.Uri
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Uploads a user-picked file with the resumable chunked API, streaming bytes natively so the JS
 * thread never holds file data. Same protocol as the web app: create session, PUT chunks with
 * retry + backoff, complete.
 */
class ManualUploader(
  private val context: Context,
  private val prefs: BackupPreferences,
  private val onProgress: (taskId: String, loaded: Long, total: Long) -> Unit,
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val jobs = ConcurrentHashMap<String, Job>()

  fun upload(
    taskId: String,
    uri: Uri,
    fileName: String,
    mimeType: String,
    clientTimestamp: String?,
    onDone: (json: String) -> Unit,
    onError: (Throwable) -> Unit,
  ) {
    val job = scope.launch {
      val api = BackupApi(prefs)
      var uploadId: String? = null
      try {
        val size = ChunkReader.size(context, uri)
        require(size > 0) { "Can't determine the size of $fileName" }
        val session = retrying { api.createSession(fileName, size, mimeType, clientTimestamp) }
        uploadId = session.uploadId
        var lastEmit = 0L

        suspend fun sendChunk(index: Int) {
          val offset = index * session.chunkSize
          val length = minOf(session.chunkSize, size - offset).toInt()
          val data = ChunkReader.read(context, uri, offset, length, size)
            ?: throw IllegalStateException("$fileName changed while uploading")
          retrying {
            api.putChunk(session.uploadId, index, data, length) { sent ->
              val now = System.currentTimeMillis()
              if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
                lastEmit = now
                onProgress(taskId, offset + sent, size)
              }
            }
          }
          onProgress(taskId, offset + length, size)
        }

        for (index in 0 until session.totalChunks) sendChunk(index)

        repeat(3) {
          when (val result = retrying { api.complete(session.uploadId) }) {
            is CompleteResult.Created -> {
              uploadId = null
              onDone(result.json)
              return@launch
            }
            is CompleteResult.MissingChunks -> result.chunks.forEach { sendChunk(it) }
          }
        }
        throw TransientBackupException("Server kept reporting missing chunks")
      } catch (e: Throwable) {
        if (e is kotlinx.coroutines.CancellationException) {
          uploadId?.let { id -> CoroutineScope(Dispatchers.IO).launch { runCatching { api.cancelSession(id) } } }
          onError(e)
          throw e
        }
        Log.w(TAG, "Upload of $fileName failed", e)
        onError(e)
      } finally {
        jobs.remove(taskId)
      }
    }
    jobs[taskId] = job
  }

  fun cancel(taskId: String) {
    jobs.remove(taskId)?.cancel()
  }

  fun shutdown() {
    scope.cancel()
  }

  /** Network errors / 5xx: retry with exponential backoff (1s, 2s, 4s). */
  private suspend fun <T> retrying(block: suspend () -> T): T {
    var attempt = 0
    while (true) {
      try {
        return block()
      } catch (e: TransientBackupException) {
        if (++attempt >= MAX_ATTEMPTS) throw e
        delay(1000L shl (attempt - 1))
      }
    }
  }

  companion object {
    private const val TAG = "OwnGalleryUpload"
    private const val MAX_ATTEMPTS = 4
    private const val PROGRESS_INTERVAL_MS = 150L
  }
}
