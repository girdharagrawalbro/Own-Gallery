package com.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.app.backup.MediaSyncPackage
import com.app.backup.BackupScheduler

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(MediaSyncPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    // Re-register Auto Backup work when its settings say it's on (e.g. after a force-stop or an app
    // update). KEEP policies leave existing schedules untouched.
    Thread { BackupScheduler.apply(this, settingsChanged = false) }.start()
  }
}
