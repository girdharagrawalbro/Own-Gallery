package com.app.backup

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat

data class MediaItem(
  val id: Long,
  val uri: Uri,
  val displayName: String,
  val mimeType: String,
  val size: Long,
  val dateModified: Long,
  /** Capture time in epoch milliseconds (falls back to date added). */
  val takenAtMillis: Long,
)

/** Reads photos and videos from MediaStore and reports which versions aren't backed up yet. */
class MediaScanner(private val context: Context) {

  fun hasReadPermission(): Boolean = MediaPermissions.canRead(context)

  /** Newest first. */
  fun pendingItems(finished: Map<Long, Pair<Long, Long>>): List<MediaItem> {
    val items = ArrayList<MediaItem>()
    query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/jpeg", finished, items)
    query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/mp4", finished, items)
    items.sortByDescending { it.takenAtMillis }
    return items
  }

  private fun query(
    collection: Uri,
    fallbackMime: String,
    finished: Map<Long, Pair<Long, Long>>,
    out: MutableList<MediaItem>,
  ) {
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_MODIFIED,
      MediaStore.MediaColumns.DATE_ADDED,
      MediaStore.MediaColumns.DATE_TAKEN,
    )
    val selection = buildString {
      append("${MediaStore.MediaColumns.SIZE} > 0")
      // Skip files that are still being written (e.g. a video that is recording).
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) append(" AND ${MediaStore.MediaColumns.IS_PENDING} = 0")
    }
    context.contentResolver.query(collection, projection, selection, null, null)?.use { c ->
      val idCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
      val nameCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
      val mimeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
      val sizeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
      val modifiedCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED)
      val addedCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
      val takenCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_TAKEN)
      while (c.moveToNext()) {
        val id = c.getLong(idCol)
        val size = c.getLong(sizeCol)
        val dateModified = c.getLong(modifiedCol)
        if (finished[id] == (size to dateModified)) continue

        val taken = if (c.isNull(takenCol)) 0L else c.getLong(takenCol)
        out += MediaItem(
          id = id,
          uri = ContentUris.withAppendedId(collection, id),
          displayName = c.getString(nameCol) ?: "media_$id",
          mimeType = c.getString(mimeCol) ?: fallbackMime,
          size = size,
          dateModified = dateModified,
          takenAtMillis = if (taken > 0) taken else c.getLong(addedCol) * 1000,
        )
      }
    }
  }

  /** Uri that keeps location EXIF when the user granted ACCESS_MEDIA_LOCATION. */
  fun readableUri(item: MediaItem): Uri =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_MEDIA_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    ) {
      MediaStore.setRequireOriginal(item.uri)
    } else {
      item.uri
    }
}

object MediaPermissions {
  fun canRead(context: Context): Boolean {
    fun granted(permission: String) =
      ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    return when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
        granted(Manifest.permission.READ_MEDIA_IMAGES) || granted(Manifest.permission.READ_MEDIA_VIDEO) ||
          (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED))
      else -> granted(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
  }
}
