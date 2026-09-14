package com.app.backup

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Local record of which device media items are backed up, plus the resumable upload session of
 * the item currently in flight. An item is identified by its MediaStore id together with its size
 * and modification time, so an edited photo counts as a new version.
 */
class BackupLedger private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  data class Entry(
    val storeId: Long,
    val size: Long,
    val dateModified: Long,
    val state: String,
    val sha256: String?,
    val uploadId: String?,
    val nextChunk: Int,
    val chunkSize: Long,
    val totalChunks: Int,
  ) {
    fun matches(item: MediaItem) = size == item.size && dateModified == item.dateModified
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE items (
        store_id INTEGER PRIMARY KEY,
        size INTEGER NOT NULL,
        date_modified INTEGER NOT NULL,
        state TEXT NOT NULL,
        sha256 TEXT,
        upload_id TEXT,
        next_chunk INTEGER NOT NULL DEFAULT 0,
        chunk_size INTEGER NOT NULL DEFAULT 0,
        total_chunks INTEGER NOT NULL DEFAULT 0,
        server_media_id INTEGER,
        error TEXT,
        updated_at INTEGER NOT NULL
      )
      """.trimIndent(),
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  /** Ids whose current version is finished (backed up or permanently skipped). */
  fun finishedVersions(): Map<Long, Pair<Long, Long>> {
    val result = HashMap<Long, Pair<Long, Long>>()
    readableDatabase.rawQuery(
      "SELECT store_id, size, date_modified FROM items WHERE state IN (?, ?)",
      arrayOf(STATE_DONE, STATE_SKIPPED),
    ).use { c ->
      while (c.moveToNext()) result[c.getLong(0)] = c.getLong(1) to c.getLong(2)
    }
    return result
  }

  fun get(storeId: Long): Entry? =
    readableDatabase.rawQuery(
      "SELECT store_id, size, date_modified, state, sha256, upload_id, next_chunk, chunk_size, total_chunks " +
        "FROM items WHERE store_id = ?",
      arrayOf(storeId.toString()),
    ).use { c ->
      if (!c.moveToFirst()) null
      else Entry(
        storeId = c.getLong(0),
        size = c.getLong(1),
        dateModified = c.getLong(2),
        state = c.getString(3),
        sha256 = c.getString(4),
        uploadId = c.getString(5),
        nextChunk = c.getInt(6),
        chunkSize = c.getLong(7),
        totalChunks = c.getInt(8),
      )
    }

  fun saveHash(item: MediaItem, sha256: String) = upsert(item, STATE_PENDING) {
    put("sha256", sha256)
  }

  fun saveProgress(item: MediaItem, sha256: String, uploadId: String, nextChunk: Int, chunkSize: Long, totalChunks: Int) =
    upsert(item, STATE_UPLOADING) {
      put("sha256", sha256)
      put("upload_id", uploadId)
      put("next_chunk", nextChunk)
      put("chunk_size", chunkSize)
      put("total_chunks", totalChunks)
    }

  fun markDone(item: MediaItem, sha256: String?, serverMediaId: Long?) = upsert(item, STATE_DONE) {
    put("sha256", sha256)
    putNull("upload_id")
    put("next_chunk", 0)
    if (serverMediaId != null) put("server_media_id", serverMediaId) else putNull("server_media_id")
    putNull("error")
  }

  /** The server will never accept this version (unsupported type, too large): don't retry it. */
  fun markSkipped(item: MediaItem, error: String) = upsert(item, STATE_SKIPPED) {
    putNull("upload_id")
    put("error", error.take(500))
  }

  fun clearSession(item: MediaItem) = upsert(item, STATE_PENDING) {
    putNull("upload_id")
    put("next_chunk", 0)
  }

  fun count(state: String): Int =
    readableDatabase.rawQuery("SELECT COUNT(*) FROM items WHERE state = ?", arrayOf(state)).use { c ->
      if (c.moveToFirst()) c.getInt(0) else 0
    }

  fun clear() {
    writableDatabase.delete("items", null, null)
  }

  private fun upsert(item: MediaItem, state: String, fill: ContentValues.() -> Unit) {
    val existing = get(item.id)
    val values = ContentValues().apply {
      put("store_id", item.id)
      put("size", item.size)
      put("date_modified", item.dateModified)
      put("state", state)
      put("updated_at", System.currentTimeMillis())
      // REPLACE rewrites the whole row: carry fields over for the same version. A new version
      // of the file starts clean (no old hash or in-flight session).
      if (existing != null && existing.matches(item)) {
        put("sha256", existing.sha256)
        put("upload_id", existing.uploadId)
        put("next_chunk", existing.nextChunk)
        put("chunk_size", existing.chunkSize)
        put("total_chunks", existing.totalChunks)
      }
      fill()
    }
    writableDatabase.insertWithOnConflict("items", null, values, SQLiteDatabase.CONFLICT_REPLACE)
  }

  companion object {
    const val STATE_PENDING = "pending"
    const val STATE_UPLOADING = "uploading"
    const val STATE_DONE = "done"
    const val STATE_SKIPPED = "skipped"

    private const val DB_NAME = "own_gallery_auto_backup.db"
    private const val DB_VERSION = 1

    @Volatile private var instance: BackupLedger? = null

    fun get(context: Context): BackupLedger =
      instance ?: synchronized(this) { instance ?: BackupLedger(context).also { instance = it } }
  }
}
