import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAutoBackupAuth, syncAutoBackupAuth } from '../services/AutoBackupService';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const saveTokens = async (
  accessToken: string,
  refreshToken: string,
) => {
  await AsyncStorage.setItem(
    ACCESS_TOKEN_KEY,
    accessToken,
  );

  await AsyncStorage.setItem(
    REFRESH_TOKEN_KEY,
    refreshToken,
  );

  // Auto Backup runs natively and needs its own copy of the credentials.
  syncAutoBackupAuth(accessToken, refreshToken);
};

export const saveAccessToken = async (
  accessToken: string,
) => {
  await AsyncStorage.setItem(
    ACCESS_TOKEN_KEY,
    accessToken,
  );

  syncAutoBackupAuth(accessToken, await AsyncStorage.getItem(REFRESH_TOKEN_KEY));
};

export const getAccessToken = async () => {
  return await AsyncStorage.getItem(
    ACCESS_TOKEN_KEY,
  );
};

export const getRefreshToken = async () => {
  return await AsyncStorage.getItem(
    REFRESH_TOKEN_KEY,
  );
};

export const clearTokens = async () => {
  await AsyncStorage.removeItem(
    ACCESS_TOKEN_KEY,
  );

  await AsyncStorage.removeItem(
    REFRESH_TOKEN_KEY,
  );

  await clearAutoBackupAuth().catch(() => undefined);
};