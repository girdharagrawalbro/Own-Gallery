package com.app.backup

import android.content.Context

/**
 * Auto Backup settings and credentials, persisted in app-private SharedPreferences so they
 * survive app restarts, React Native reloads and device reboots. This is the single source
 * of truth: the JS layer only reads and writes it through [MediaSyncModule].
 */
class BackupPreferences(context: Context) {

  private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  val enabled: Boolean get() = prefs.getBoolean(KEY_ENABLED, false)
  val wifiOnly: Boolean get() = prefs.getBoolean(KEY_WIFI_ONLY, true)
  val chargingOnly: Boolean get() = prefs.getBoolean(KEY_CHARGING_ONLY, false)

  val apiBaseUrl: String? get() = prefs.getString(KEY_API_BASE_URL, null)
  val accessToken: String? get() = prefs.getString(KEY_ACCESS, null)
  val refreshToken: String? get() = prefs.getString(KEY_REFRESH, null)

  val hasCredentials: Boolean
    get() = !apiBaseUrl.isNullOrBlank() && !refreshToken.isNullOrBlank()

  val lastRunAt: Long get() = prefs.getLong(KEY_LAST_RUN_AT, 0)
  val lastSuccessAt: Long get() = prefs.getLong(KEY_LAST_SUCCESS_AT, 0)
  val lastResult: String get() = prefs.getString(KEY_LAST_RESULT, "") ?: ""
  val lastError: String get() = prefs.getString(KEY_LAST_ERROR, "") ?: ""

  fun setSettings(enabled: Boolean, wifiOnly: Boolean, chargingOnly: Boolean) {
    prefs.edit().apply {
      putBoolean(KEY_ENABLED, enabled)
      putBoolean(KEY_WIFI_ONLY, wifiOnly)
      putBoolean(KEY_CHARGING_ONLY, chargingOnly)
    }.commit()
  }

  fun setApiBaseUrl(url: String) {
    prefs.edit().putString(KEY_API_BASE_URL, url.trimEnd('/')).commit()
  }

  fun setTokens(access: String?, refresh: String?) {
    prefs.edit().apply {
      if (access != null) putString(KEY_ACCESS, access)
      if (refresh != null) putString(KEY_REFRESH, refresh)
    }.commit()
  }

  fun clearTokens() {
    prefs.edit().apply {
      remove(KEY_ACCESS)
      remove(KEY_REFRESH)
    }.commit()
  }

  /** Outcome of the most recent worker run, shown in Settings. */
  fun recordRun(result: String, error: String = "", success: Boolean = false) {
    val now = System.currentTimeMillis()
    prefs.edit().apply {
      putLong(KEY_LAST_RUN_AT, now)
      putString(KEY_LAST_RESULT, result)
      putString(KEY_LAST_ERROR, error)
      if (success) putLong(KEY_LAST_SUCCESS_AT, now)
    }.commit()
  }

  companion object {
    private const val FILE = "own_gallery_auto_backup"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_WIFI_ONLY = "wifi_only"
    private const val KEY_CHARGING_ONLY = "charging_only"
    private const val KEY_API_BASE_URL = "api_base_url"
    private const val KEY_ACCESS = "access_token"
    private const val KEY_REFRESH = "refresh_token"
    private const val KEY_LAST_RUN_AT = "last_run_at"
    private const val KEY_LAST_SUCCESS_AT = "last_success_at"
    private const val KEY_LAST_RESULT = "last_result"
    private const val KEY_LAST_ERROR = "last_error"
  }
}
