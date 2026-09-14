package com.app.backup

import android.content.Context
import android.provider.MediaStore
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Translates the persisted settings into WorkManager requests. WorkManager stores them in its own
 * database and re-registers them after reboots and app updates, so scheduling survives restarts
 * without any service of ours running.
 */
object BackupScheduler {

  const val WORK_PERIODIC = "own-gallery-backup-periodic"
  const val WORK_MEDIA_TRIGGER = "own-gallery-backup-new-media"
  const val WORK_CONTINUE = "own-gallery-backup-continue"
  const val WORK_MANUAL = "own-gallery-backup-now"
  const val TAG_MEDIA_TRIGGER = "own-gallery-backup-trigger"
  private const val TAG_BACKUP = "own-gallery-backup"

  private val allWork = listOf(WORK_PERIODIC, WORK_MEDIA_TRIGGER, WORK_CONTINUE, WORK_MANUAL)

  /**
   * Schedule or cancel according to the stored settings.
   * @param settingsChanged replace existing requests so new constraints apply immediately.
   */
  fun apply(context: Context, settingsChanged: Boolean) {
    val prefs = BackupPreferences(context)
    if (!prefs.enabled || !prefs.hasCredentials) {
      cancelAll(context)
      return
    }
    val workManager = WorkManager.getInstance(context)
    val constraints = constraints(prefs)

    val periodic = PeriodicWorkRequestBuilder<BackupWorker>(1, TimeUnit.HOURS, 15, TimeUnit.MINUTES)
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
      .addTag(TAG_BACKUP)
      .build()
    workManager.enqueueUniquePeriodicWork(
      WORK_PERIODIC,
      // UPDATE keeps the existing schedule but applies new constraints.
      if (settingsChanged) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP,
      periodic,
    )
    workManager.enqueueUniqueWork(
      WORK_MEDIA_TRIGGER,
      if (settingsChanged) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP,
      mediaTriggerRequest(constraints),
    )
    if (settingsChanged) {
      // Constraints of an in-flight continuation must follow the new settings too.
      workManager.cancelUniqueWork(WORK_CONTINUE)
      workManager.cancelUniqueWork(WORK_MANUAL)
    }
  }

  fun cancelAll(context: Context) {
    val workManager = WorkManager.getInstance(context)
    allWork.forEach(workManager::cancelUniqueWork)
  }

  /** Run a pass as soon as constraints allow ("Back up now"). */
  fun runNow(context: Context) {
    val prefs = BackupPreferences(context)
    if (!prefs.enabled || !prefs.hasCredentials) return
    WorkManager.getInstance(context).enqueueUniqueWork(
      WORK_MANUAL,
      ExistingWorkPolicy.KEEP,
      OneTimeWorkRequestBuilder<BackupWorker>().setConstraints(constraints(prefs)).addTag(TAG_BACKUP).build(),
    )
  }

  /** More items remain after a pass used its time budget: continue soon rather than next hour. */
  fun enqueueContinuation(context: Context) {
    val prefs = BackupPreferences(context)
    WorkManager.getInstance(context).enqueueUniqueWork(
      WORK_CONTINUE,
      ExistingWorkPolicy.APPEND_OR_REPLACE,
      OneTimeWorkRequestBuilder<BackupWorker>()
        .setConstraints(constraints(prefs))
        .setInitialDelay(30, TimeUnit.SECONDS)
        .addTag(TAG_BACKUP)
        .build(),
    )
  }

  /** Called from inside the trigger worker: APPEND so we don't cancel the run that is executing. */
  fun rearmMediaTrigger(context: Context) {
    val prefs = BackupPreferences(context)
    WorkManager.getInstance(context).enqueueUniqueWork(
      WORK_MEDIA_TRIGGER,
      ExistingWorkPolicy.APPEND_OR_REPLACE,
      mediaTriggerRequest(constraints(prefs)),
    )
  }

  fun workStates(context: Context): Map<String, String> {
    val workManager = WorkManager.getInstance(context)
    return allWork.associateWith { name ->
      val infos = workManager.getWorkInfosForUniqueWork(name).get()
      when {
        infos.any { it.state == WorkInfo.State.RUNNING } -> "running"
        infos.any { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.BLOCKED } -> "scheduled"
        else -> "idle"
      }
    }
  }

  private fun constraints(prefs: BackupPreferences): Constraints =
    Constraints.Builder()
      // UNMETERED = Wi-Fi/Ethernet only; CONNECTED also allows mobile data.
      .setRequiredNetworkType(if (prefs.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
      .setRequiresCharging(prefs.chargingOnly)
      .setRequiresBatteryNotLow(true)
      .build()

  /** Runs shortly after new photos/videos appear in MediaStore (and the constraints are met). */
  private fun mediaTriggerRequest(base: Constraints) =
    OneTimeWorkRequestBuilder<BackupWorker>()
      .setConstraints(
        Constraints.Builder()
          .setRequiredNetworkType(base.requiredNetworkType)
          .setRequiresCharging(base.requiresCharging())
          .setRequiresBatteryNotLow(true)
          .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
          .addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true)
          .setTriggerContentUpdateDelay(30, TimeUnit.SECONDS)
          .setTriggerContentMaxDelay(5, TimeUnit.MINUTES)
          .build(),
      )
      .addTag(TAG_BACKUP)
      .addTag(TAG_MEDIA_TRIGGER)
      .build()
}
