package com.app.backup

import android.content.Context
import android.net.Uri
import java.io.FileInputStream
import java.io.IOException

object ChunkReader {

  /** Size of a file:// or content:// uri, or -1 when the provider doesn't report it. */
  fun size(context: Context, uri: Uri): Long =
    context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: throw IOException("Can't open $uri")

  /**
   * Reads [length] bytes at [offset] straight from the file descriptor (no full-file buffering).
   * Returns null when the file no longer has the expected size (edited or truncated meanwhile).
   */
  fun read(context: Context, uri: Uri, offset: Long, length: Int, expectedSize: Long): ByteArray? {
    val buffer = ByteArray(length)
    context.contentResolver.openFileDescriptor(uri, "r").use { pfd ->
      pfd ?: throw IOException("Can't open $uri")
      if (pfd.statSize >= 0 && pfd.statSize != expectedSize) return null
      FileInputStream(pfd.fileDescriptor).use { input ->
        input.channel.position(offset)
        var read = 0
        while (read < length) {
          val n = input.read(buffer, read, length - read)
          if (n < 0) return null
          read += n
        }
      }
    }
    return buffer
  }
}
