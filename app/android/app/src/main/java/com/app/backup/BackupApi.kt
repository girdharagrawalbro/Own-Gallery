package com.app.backup

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject

/** Errors worth retrying later (network drop, 5xx, throttling). */
class TransientBackupException(message: String, cause: Throwable? = null) : IOException(message, cause)

/** The refresh token is no longer valid; the user must sign in again in the app. */
class AuthRequiredException : Exception("Sign in again to resume backup")

/** The server permanently rejected this file (unsupported type, too large...). */
class RejectedFileException(message: String) : Exception(message)

/** The upload session expired on the server; start this file again. */
class SessionExpiredException : Exception("Upload session expired")

data class UploadSession(val uploadId: String, val chunkSize: Long, val totalChunks: Int)

sealed class CompleteResult {
  /** [json] is the created Media object as returned by the server. */
  data class Created(val mediaId: Long, val json: String) : CompleteResult()
  data class MissingChunks(val chunks: List<Int>) : CompleteResult()
}

/** Minimal client for the Django endpoints the backup worker needs. */
class BackupApi(private val prefs: BackupPreferences) {

  private val base: String
    get() = prefs.apiBaseUrl ?: throw AuthRequiredException()

  suspend fun checkHashes(hashes: List<String>): Set<String> {
    val body = JSONObject().put("hashes", JSONArray(hashes)).toString().toRequestBody(JSON)
    val json = JSONObject(send { post("$base/media/check-hashes/", body) }.use { expect(it, 200).body!!.string() })
    val existing = json.getJSONArray("existing")
    return (0 until existing.length()).map { existing.getString(it) }.toSet()
  }

  suspend fun createSession(item: MediaItem): UploadSession =
    createSession(item.displayName, item.size, item.mimeType, item.takenAtMillis.toString())

  suspend fun createSession(fileName: String, size: Long, mimeType: String, clientTimestamp: String?): UploadSession {
    val payload = JSONObject()
      .put("filename", fileName)
      .put("file_size", size)
      .put("mime_type", mimeType)
    if (!clientTimestamp.isNullOrBlank()) payload.put("client_timestamp", clientTimestamp)
    val json = send { post("$base/media/uploads/", payload.toString().toRequestBody(JSON)) }.use { response ->
      if (response.code == 400 || response.code == 413) throw RejectedFileException(errorMessage(response))
      JSONObject(expect(response, 201).body!!.string())
    }
    return UploadSession(json.getString("upload_id"), json.getLong("chunk_size"), json.getInt("total_chunks"))
  }

  suspend fun putChunk(uploadId: String, index: Int, data: ByteArray, length: Int, onBytesSent: ((Long) -> Unit)? = null) {
    val body = if (onBytesSent == null) data.toRequestBody(OCTET_STREAM, 0, length) else ProgressBody(data, length, onBytesSent)
    send { put("$base/media/uploads/$uploadId/chunks/$index/", body) }.use { response ->
      when (response.code) {
        204 -> Unit
        404 -> throw SessionExpiredException()
        400 -> throw RejectedFileException(errorMessage(response))
        else -> throw httpError(response)
      }
    }
  }

  suspend fun complete(uploadId: String): CompleteResult =
    send { post("$base/media/uploads/$uploadId/complete/", ByteArray(0).toRequestBody(JSON)) }.use { response ->
      when (response.code) {
        200, 202 -> {
          val json = response.body!!.string()
          CompleteResult.Created(JSONObject(json).getLong("id"), json)
        }
        404 -> throw SessionExpiredException()
        400 -> {
          val json = JSONObject(response.body?.string() ?: "{}")
          val missing = json.optJSONArray("missing_chunks")
            ?: throw RejectedFileException(json.optString("error", "Upload rejected"))
          CompleteResult.MissingChunks((0 until missing.length()).map { missing.getInt(it) })
        }
        else -> throw httpError(response)
      }
    }

  suspend fun cancelSession(uploadId: String) {
    runCatching { send { delete("$base/media/uploads/$uploadId/") }.close() }
  }

  // -- plumbing -------------------------------------------------------------

  private fun Request.Builder.post(url: String, body: okhttp3.RequestBody) = url(url).post(body)
  private fun Request.Builder.put(url: String, body: okhttp3.RequestBody) = url(url).put(body)
  private fun Request.Builder.delete(url: String) = url(url).delete()

  /** Sends with the stored access token, refreshing it once on 401. */
  private suspend fun send(configure: Request.Builder.() -> Request.Builder): Response {
    val first = execute(authorized(configure))
    if (first.code != 401) return first
    first.close()
    refreshAccessToken()
    val second = execute(authorized(configure))
    if (second.code == 401) {
      second.close()
      throw AuthRequiredException()
    }
    return second
  }

  private fun authorized(configure: Request.Builder.() -> Request.Builder): Request {
    val builder = Request.Builder().configure().header("Accept", "application/json")
    prefs.accessToken?.let { builder.header("Authorization", "Bearer $it") }
    return builder.build()
  }

  private suspend fun refreshAccessToken() {
    val refresh = prefs.refreshToken ?: throw AuthRequiredException()
    val body = JSONObject().put("refresh", refresh).toString().toRequestBody(JSON)
    execute(Request.Builder().url("$base/auth/token/refresh/").post(body).build()).use { response ->
      when {
        response.isSuccessful -> {
          val json = JSONObject(response.body!!.string())
          prefs.setTokens(json.getString("access"), json.optString("refresh").ifBlank { null })
        }
        response.code in 400..401 -> throw AuthRequiredException()
        else -> throw TransientBackupException("Token refresh failed: HTTP ${response.code}")
      }
    }
  }

  private fun expect(response: Response, code: Int): Response {
    if (response.code == code) return response
    throw httpError(response)
  }

  private fun httpError(response: Response): Exception {
    val message = "HTTP ${response.code}: ${errorMessage(response)}"
    return if (response.code >= 500 || response.code == 429 || response.code == 408) {
      TransientBackupException(message)
    } else {
      IOException(message)
    }
  }

  private fun errorMessage(response: Response): String {
    val text = runCatching { response.peekBody(4096).string() }.getOrDefault("")
    return runCatching { JSONObject(text).optString("error") }.getOrNull()?.ifBlank { null }
      ?: text.take(200).ifBlank { "HTTP ${response.code}" }
  }

  /** Suspends until the call finishes; coroutine cancellation (worker stopped) cancels the call. */
  private suspend fun execute(request: Request): Response = suspendCancellableCoroutine { continuation ->
    val call = client.newCall(request)
    continuation.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
      override fun onResponse(call: Call, response: Response) {
        // If the worker was cancelled meanwhile, release the connection.
        continuation.resume(response) { _ -> response.close() }
      }
      override fun onFailure(call: Call, e: IOException) {
        if (continuation.isActive) continuation.resumeWithException(TransientBackupException(e.message ?: "Network error", e))
      }
    })
  }

  /** Streams a chunk in small slices and reports how many bytes have been written. */
  private class ProgressBody(
    private val data: ByteArray,
    private val length: Int,
    private val onBytesSent: (Long) -> Unit,
  ) : okhttp3.RequestBody() {
    override fun contentType() = OCTET_STREAM
    override fun contentLength() = length.toLong()
    override fun writeTo(sink: okio.BufferedSink) {
      var written = 0
      while (written < length) {
        val n = minOf(64 * 1024, length - written)
        sink.write(data, written, n)
        written += n
        onBytesSent(written.toLong())
      }
    }
  }

  companion object {
    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val OCTET_STREAM = "application/octet-stream".toMediaType()

    private val client: OkHttpClient by lazy {
      OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    }
  }
}
