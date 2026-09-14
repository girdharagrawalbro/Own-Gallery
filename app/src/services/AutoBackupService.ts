import { PermissionsAndroid, Platform } from 'react-native';
import NativeMediaSync, { type BackupStatus } from '../native/NativeMediaSync';

export type { BackupStatus };

/**
 * Auto Backup runs natively in Android WorkManager. This module only configures it: settings,
 * credentials and permissions. Nothing here runs in the background.
 */
export const isAutoBackupAvailable = Platform.OS === 'android' && NativeMediaSync != null;

export const configureAutoBackup = (apiBaseUrl: string) => {
  NativeMediaSync?.configure(apiBaseUrl);
};

/** Mirrors the app's tokens so the worker can upload while the app is closed. */
export const syncAutoBackupAuth = (accessToken: string | null, refreshToken: string | null) => {
  if (NativeMediaSync && accessToken && refreshToken) {
    NativeMediaSync.setAuthTokens(accessToken, refreshToken);
  }
};

/** On logout: forget credentials, cancel scheduled work and clear the backup record. */
export const clearAutoBackupAuth = async () => {
  await NativeMediaSync?.clearAuth();
};

export const getAutoBackupStatus = async (): Promise<BackupStatus | null> =>
  NativeMediaSync ? NativeMediaSync.getStatus() : null;

export const updateAutoBackupSettings = async (settings: {
  enabled: boolean;
  wifiOnly: boolean;
  chargingOnly: boolean;
}) => {
  if (!NativeMediaSync) throw new Error('Auto Backup is only available on Android');
  await NativeMediaSync.setSettings(settings.enabled, settings.wifiOnly, settings.chargingOnly);
};

export const runAutoBackupNow = async () => {
  await NativeMediaSync?.runNow();
};

export type MediaAccess = 'full' | 'partial' | 'denied';

/** Ask for photo/video read access (and, optionally, location metadata in originals). */
export const requestMediaAccess = async (): Promise<MediaAccess> => {
  if (Platform.OS !== 'android') return 'denied';
  const { PERMISSIONS, RESULTS } = PermissionsAndroid;
  const sdk = Number(Platform.Version);

  let access: MediaAccess;
  if (sdk >= 33) {
    const result = await PermissionsAndroid.requestMultiple([
      PERMISSIONS.READ_MEDIA_IMAGES,
      PERMISSIONS.READ_MEDIA_VIDEO,
    ]);
    const full =
      result[PERMISSIONS.READ_MEDIA_IMAGES] === RESULTS.GRANTED &&
      result[PERMISSIONS.READ_MEDIA_VIDEO] === RESULTS.GRANTED;
    if (full) {
      access = 'full';
    } else if (sdk >= 34 && (await PermissionsAndroid.check(PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED))) {
      access = 'partial'; // "Select photos": only the chosen items can be backed up
    } else {
      access = 'denied';
    }
  } else {
    const result = await PermissionsAndroid.request(PERMISSIONS.READ_EXTERNAL_STORAGE);
    access = result === RESULTS.GRANTED ? 'full' : 'denied';
  }

  if (access !== 'denied' && sdk >= 29) {
    // Without this Android strips GPS data from the files we read. Optional.
    await PermissionsAndroid.request(PERMISSIONS.ACCESS_MEDIA_LOCATION).catch(() => undefined);
  }
  return access;
};
