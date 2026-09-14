import React from 'react';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AuthScreen from './src/screens/Auth/AuthScreen';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { UploadProvider } from './src/context/UploadContext';
import UploadBanner from './src/components/UploadBanner';
import ShareReceiver from './src/components/ShareReceiver';
import { API_BASE_URL } from './src/api/client';
import { getAccessToken, getRefreshToken } from './src/storage/authStorage';
import { configureAutoBackup, syncAutoBackupAuth } from './src/services/AutoBackupService';

// Give the native Auto Backup worker the API address and the current session
// (covers users who were already signed in before Auto Backup existed).
configureAutoBackup(API_BASE_URL);
Promise.all([getAccessToken(), getRefreshToken()])
  .then(([access, refresh]) => syncAutoBackupAuth(access, refresh))
  .catch(() => undefined);

const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <UploadProvider>
      <UploadBanner />
      <AppNavigator />
      <ShareReceiver />
    </UploadProvider>
  );
};

const App = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GestureHandlerRootView>
  );
};

export default App;
