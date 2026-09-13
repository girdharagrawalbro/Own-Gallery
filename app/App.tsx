import React from 'react';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AuthScreen from './src/screens/Auth/AuthScreen';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { UploadProvider } from './src/context/UploadContext';
import UploadBanner from './src/components/UploadBanner';
import ShareReceiver from './src/components/ShareReceiver';

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
