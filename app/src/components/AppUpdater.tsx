import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  NativeModules,
} from 'react-native';
import RNFS from 'react-native-fs';

import { API_BASE_URL } from '../api/client';

const { ApkInstaller } = NativeModules;

const CURRENT_VERSION_CODE = 1; // You can pull this dynamically using react-native-device-info if available

interface UpdateInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  forceUpdate: boolean;
}

export const AppUpdater = () => {
  const VERSION_URL = `${API_BASE_URL.replace('/api', '')}/version.json`;
  
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    try {
      const response = await fetch(VERSION_URL);
      const data: UpdateInfo = await response.json();

      if (data.versionCode > CURRENT_VERSION_CODE) {
        setUpdateInfo(data);
        setIsVisible(true);
      }
    } catch (error) {
      console.log('Failed to check for updates:', error);
    }
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    const destPath = `${RNFS.DocumentDirectoryPath}/app_update.apk`;

    try {
      // Clean up previous downloads
      if (await RNFS.exists(destPath)) {
        await RNFS.unlink(destPath);
      }

      const downloadResult = RNFS.downloadFile({
        fromUrl: updateInfo.apkUrl,
        toFile: destPath,
        progress: (res) => {
          const progress = (res.bytesWritten / res.contentLength) * 100;
          setDownloadProgress(Math.round(progress));
        },
      });

      await downloadResult.promise;

      setIsDownloading(false);
      setIsVisible(false);

      // Trigger the native APK Installer
      if (ApkInstaller) {
        await ApkInstaller.install(destPath);
      } else {
        Alert.alert('Error', 'ApkInstaller module not found.');
      }
    } catch (error) {
      console.log('Download failed:', error);
      setIsDownloading(false);
      Alert.alert('Update Failed', 'Failed to download the update. Please try again later.');
    }
  };

  const handleSkip = () => {
    if (updateInfo?.forceUpdate) {
      Alert.alert('Update Required', 'You must update to continue using the app.');
      return;
    }
    setIsVisible(false);
  };

  if (!isVisible || !updateInfo) return null;

  return (
    <Modal visible={isVisible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>New version available 🎉</Text>
          <Text style={styles.message}>
            Version {updateInfo.versionName} is available. Would you like to update now?
          </Text>

          {isDownloading ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="large" color="#1a73e8" />
              <Text style={styles.progressText}>Downloading... {downloadProgress}%</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              {!updateInfo.forceUpdate && (
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                  <Text style={styles.skipText}>Later</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
                <Text style={styles.updateText}>Update Now</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#202124',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#5f6368',
    marginBottom: 24,
    lineHeight: 22,
  },
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  progressText: {
    marginTop: 12,
    fontSize: 16,
    color: '#1a73e8',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  skipText: {
    color: '#5f6368',
    fontSize: 16,
    fontWeight: '500',
  },
  updateButton: {
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  updateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
