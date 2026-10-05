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
  /**
   * Ledger key. Images and videos have separate MediaStore id spaces, so video ids are negated to
   * keep the two from colliding (see [MediaScanner.ledgerKey]). Use [uri] to open the file.
   */
  val id: Long,
  val uri: Uri,
  val displayName: String,
  val mimeType: String,
  val size: Long,
  val dateModified: Long,
  /** Capture time in epoch milliseconds (falls back to date added). */
  val takenAtMillis: Long,
)

/** A device folder (MediaStore bucket) such as Camera, Screenshots or WhatsApp Images. */
data class DeviceFolder(
  val id: Long,
  val name: String,
  val total: Int,
  /** Items in this folder whose current version isn't backed up yet. */
  val pending: Int,
)

/** Reads photos and videos from MediaStore and reports which versions aren't backed up yet. */
class MediaScanner(private val context: Context) {

  fun hasReadPermission(): Boolean = MediaPermissions.canRead(context)

  private fun ledgerKey(mediaStoreId: Long, isVideo: Boolean): Long = if (isVideo) -mediaStoreId else mediaStoreId

  /**
   * Newest first. [folderIds] limits the scan to those folders; empty means every folder.
   */
  fun pendingItems(finished: Map<Long, Pair<Long, Long>>, folderIds: Set<Long> = emptySet()): List<MediaItem> {
    val items = ArrayList<MediaItem>()
    query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/jpeg", false, finished, folderIds, items)
    query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/mp4", true, finished, folderIds, items)
    items.sortByDescending { it.takenAtMillis }
    return items
  }

  /** Every folder that holds photos or videos, with how many of its items still need backing up. */
  fun folders(finished: Map<Long, Pair<Long, Long>>): List<DeviceFolder> {
    class Acc(var name: String, var total: Int = 0, var pending: Int = 0)
    val byId = LinkedHashMap<Long, Acc>()
    for ((collection, isVideo) in listOf(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI to false,
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI to true,
    )) {
      val projection = arrayOf(
        MediaStore.MediaColumns._ID,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.DATE_MODIFIED,
        MediaStore.MediaColumns.BUCKET_ID,
        MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
      )
      context.contentResolver.query(collection, projection, "${MediaStore.MediaColumns.SIZE} > 0", null, null)?.use { c ->
        while (c.moveToNext()) {
          val bucketId = c.getLong(3)
          val acc = byId.getOrPut(bucketId) { Acc(c.getString(4) ?: "Other") }
          acc.total++
          if (finished[ledgerKey(c.getLong(0), isVideo)] != (c.getLong(1) to c.getLong(2))) acc.pending++
        }
      }
    }
    return byId.map { (id, a) -> DeviceFolder(id, a.name, a.total, a.pending) }.sortedByDescending { it.total }
  }

  private fun query(
    collection: Uri,
    fallbackMime: String,
    isVideo: Boolean,
    finished: Map<Long, Pair<Long, Long>>,
    folderIds: Set<Long>,
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
      MediaStore.MediaColumns.BUCKET_ID,
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
      val bucketCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.BUCKET_ID)
      while (c.moveToNext()) {
        if (folderIds.isNotEmpty() && c.getLong(bucketCol) !in folderIds) continue
        val id = c.getLong(idCol)
        val key = ledgerKey(id, isVideo)
        val size = c.getLong(sizeCol)
        val dateModified = c.getLong(modifiedCol)
        if (finished[key] == (size to dateModified)) continue

        val taken = if (c.isNull(takenCol)) 0L else c.getLong(takenCol)
        out += MediaItem(
          id = key,
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
