package com.owngallery.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import java.io.File;

public class ApkInstallerModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public ApkInstallerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "ApkInstaller";
    }

    @ReactMethod
    public void install(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file does not exist at path: " + filePath);
                return;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(reactContext, reactContext.getPackageName() + ".provider", file);
            } else {
                apkUri = Uri.fromFile(file);
            }

            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("INSTALL_FAILED", e.getMessage());
        }
    }
}
