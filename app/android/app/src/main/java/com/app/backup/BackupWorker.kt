package com.app.backup

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex

/**
 * WorkManager entry point for Auto Backup. Runs as ordinary deferrable background work (no
 * foreground service): WorkManager decides when network/charging constraints and Android's
 * background execution limits allow it to run, and stops it when they no longer do.
 */
class BackupWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

  override suspend fun doWork(): Result {
    val prefs = BackupPreferences(applicationContext)
    val isMediaTrigger = tags.contains(BackupScheduler.TAG_MEDIA_TRIGGER)

    try {
      if (!prefs.enabled) {
        BackupScheduler.cancelAll(applicationContext)
        return Result.success()
      }
      if (!prefs.hasCredentials) {
        prefs.recordRun(RESULT_SIGN_IN_REQUIRED, "Sign in to resume backup")
        return Result.success()
      }
      if (!MediaPermissions.canRead(applicationContext)) {
        prefs.recordRun(RESULT_PERMISSION_REQUIRED, "Allow access to photos and videos")
        return Result.success()
      }
      // The periodic, media-trigger and manual requests share one runner; never upload in parallel.
      if (!runLock.tryLock()) {
        // The running pass already scanned MediaStore; make it look again when it finishes.
        Log.i(TAG, "Another backup pass is already running; requesting a rescan")
        rescanRequested.set(true)
        return Result.success()
      }
      try {
        return runPass(prefs)
      } finally {
        runLock.unlock()
      }
    } finally {
      // A content-URI trigger fires once; register it again for the next new photo.
      if (isMediaTrigger && prefs.enabled && prefs.hasCredentials) {
        BackupScheduler.rearmMediaTrigger(applicationContext)
      }
    }
  }

  private suspend fun runPass(prefs: BackupPreferences): Result {
    val runner = BackupRunner(applicationContext, prefs, BackupLedger.get(applicationContext), BackupApi(prefs))
    return try {
      // WorkManager stops a worker after ~10 minutes; leave room to save progress.
      when (val outcome = runner.run(System.currentTimeMillis() + TIME_BUDGET_MS)) {
        is BackupRunner.Outcome.Finished -> {
          Log.i(TAG, "Backup pass finished: $outcome")
          prefs.recordRun(RESULT_UP_TO_DATE, success = true)
          if (rescanRequested.getAndSet(false)) BackupScheduler.enqueueContinuation(applicationContext)
          Result.success()
        }
        is BackupRunner.Outcome.Paused -> {
          Log.i(TAG, "Backup pass paused (${outcome.reason}) after ${outcome.uploaded} upload(s)")
          prefs.recordRun(RESULT_PAUSED, outcome.reason)
          if (outcome.reason == "time budget reached") BackupScheduler.enqueueContinuation(applicationContext)
          Result.success()
        }
      }
    } catch (e: CancellationException) {
      // Stopped by WorkManager (constraints lost or work cancelled). Progress is already saved.
      prefs.recordRun(RESULT_PAUSED, "stopped by system")
      throw e
    } catch (e: AuthRequiredException) {
      prefs.recordRun(RESULT_SIGN_IN_REQUIRED, e.message ?: "Sign in again")
      Result.success()
    } catch (e: TransientBackupException) {
      Log.w(TAG, "Backup pass failed, will retry", e)
      prefs.recordRun(RESULT_ERROR, e.message ?: "Network error")
      Result.retry()
    } catch (e: Exception) {
      Log.e(TAG, "Backup pass failed", e)
      prefs.recordRun(RESULT_ERROR, e.message ?: e.javaClass.simpleName)
      if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()
    }
  }

  companion object {
    private const val TAG = "OwnGalleryBackup"
    private const val TIME_BUDGET_MS = 8 * 60 * 1000L
    private const val MAX_ATTEMPTS = 5

    const val RESULT_UP_TO_DATE = "up_to_date"
    const val RESULT_PAUSED = "paused"
    const val RESULT_ERROR = "error"
    const val RESULT_SIGN_IN_REQUIRED = "sign_in_required"
    const val RESULT_PERMISSION_REQUIRED = "permission_required"

    private val runLock = Mutex()
    private val rescanRequested = AtomicBoolean(false)
  }
}
