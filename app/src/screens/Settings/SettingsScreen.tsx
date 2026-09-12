import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  TextInput,
  Pressable,
  ToastAndroid,
  ActivityIndicator
} from 'react-native';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { updateProfile, changePassword } from '../../api/auth';
import { getStats } from '../../api/media';
import { ChevronRight, LogOut, User, Lock, Edit3 } from 'lucide-react-native';

const SettingsScreen = () => {
  const { user, setUser, logout } = useAuth();

  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [cacheSize, setCacheSize] = useState('0 MB');
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  const [stats, setStats] = useState<{ total_items: number, total_size: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);

  React.useEffect(() => {
    calculateCacheSize();
    fetchStats();
    checkAutoBackup();
  }, []);

  const checkAutoBackup = async () => {
    const BackgroundActions = require('react-native-background-actions').default;
    setAutoBackupEnabled(BackgroundActions.isRunning());
    
    const wifiOnlyStr = await AsyncStorage.getItem('@backup_wifi_only');
    setWifiOnly(wifiOnlyStr !== 'false'); // Default to true if not set
  };

  const toggleAutoBackup = async (val: boolean) => {
    const { startAutoBackup, stopAutoBackup } = require('../../services/AutoBackupService');
    setAutoBackupEnabled(val);
    if (val) {
      await startAutoBackup();
      ToastAndroid.show("Auto-Backup Started", ToastAndroid.SHORT);
    } else {
      await stopAutoBackup();
      ToastAndroid.show("Auto-Backup Stopped", ToastAndroid.SHORT);
    }
  };

  const toggleWifiOnly = async (val: boolean) => {
    setWifiOnly(val);
    await AsyncStorage.setItem('@backup_wifi_only', val.toString());
  };

  const fetchStats = async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.log('Failed to fetch stats', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateCacheSize = async () => {
    try {
      const result = await RNFS.readDir(RNFS.CachesDirectoryPath);
      let totalSize = 0;
      for (const file of result) {
        if (file.isFile()) {
          totalSize += file.size;
        }
      }
      setCacheSize((totalSize / (1024 * 1024)).toFixed(2) + ' MB');
    } catch (e) {
      console.log('Error calculating cache size:', e);
    }
  };

  const clearCache = async () => {
    setIsClearingCache(true);
    try {
      const result = await RNFS.readDir(RNFS.CachesDirectoryPath);
      for (const file of result) {
        if (file.isFile()) {
          await RNFS.unlink(file.path);
        }
      }
      setCacheSize('0 MB');
      ToastAndroid.show('Cache cleared', ToastAndroid.SHORT);
    } catch (e) {
      Alert.alert('Error', 'Failed to clear cache');
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout }
      ]
    );
  };

  const handleUpdateProfile = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Email cannot be empty');
      return;
    }
    setIsUpdating(true);
    try {
      const updatedUser = await updateProfile({
        first_name: firstName,
        last_name: lastName,
        email: email
      });
      setUser(updatedUser);
      ToastAndroid.show('Profile updated successfully', ToastAndroid.SHORT);
      setEditProfileVisible(false);
    } catch (error: any) {
      console.log('Update profile error:', error?.response?.data);
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!oldPassword || !newPassword) {
      Alert.alert('Error', 'Please fill all password fields');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters');
      return;
    }
    setIsUpdating(true);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
      ToastAndroid.show('Password changed successfully', ToastAndroid.SHORT);
      setPasswordVisible(false);
      setOldPassword('');
      setNewPassword('');
    } catch (error: any) {
      const msg = error?.response?.data?.old_password?.[0] || 'Failed to change password.';
      Alert.alert('Error', msg);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContent}>
        <Text style={styles.headerTitle}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <User size={20} color="#007AFF" style={styles.rowIcon} />
                <View>
                  <Text style={styles.rowText}>
                    {user?.first_name || user?.last_name
                      ? `${user?.first_name} ${user?.last_name}`.trim()
                      : 'Profile'}
                  </Text>
                  <Text style={styles.subText}>{user?.email || 'Loading...'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => {
                setFirstName(user?.first_name || '');
                setLastName(user?.last_name || '');
                setEmail(user?.email || '');
                setEditProfileVisible(true);
              }} style={styles.editBtn}>
                <Edit3 size={18} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.row, styles.noBorder]}
              onPress={() => {
                setOldPassword('');
                setNewPassword('');
                setPasswordVisible(true);
              }}
            >
              <View style={styles.rowLeft}>
                <Lock size={20} color="#34C759" style={styles.rowIcon} />
                <Text style={styles.rowText}>Change Password</Text>
              </View>
              <ChevronRight size={20} color="#c7c7cc" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PREFERENCES</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowText}>Theme</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {['system', 'light', 'dark'].map((t) => (
                  <TouchableOpacity key={t} onPress={() => setTheme(t as any)}>
                    <Text style={{
                      color: theme === t ? '#007AFF' : '#999',
                      fontWeight: theme === t ? 'bold' : 'normal',
                      textTransform: 'capitalize'
                    }}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.row, styles.noBorder]}>
              <View>
                <Text style={styles.rowText}>Cached Media</Text>
                <Text style={styles.subText}>{cacheSize}</Text>
              </View>
              <TouchableOpacity onPress={clearCache} disabled={isClearingCache}>
                {isClearingCache ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={{ color: '#FF3B30' }}>Clear Cache</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>AUTO BACKUP</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View>
                <Text style={styles.rowText}>Auto-sync Camera Roll</Text>
                <Text style={styles.subText}>Uploads photos in background</Text>
              </View>
              <Switch
                value={autoBackupEnabled}
                onValueChange={toggleAutoBackup}
                trackColor={{ false: '#767577', true: '#34C759' }}
              />
            </View>
            <View style={[styles.row, styles.noBorder]}>
              <View>
                <Text style={styles.rowText}>Wi-Fi Only</Text>
                <Text style={styles.subText}>Save cellular data</Text>
              </View>
              <Switch
                value={wifiOnly}
                onValueChange={toggleWifiOnly}
                trackColor={{ false: '#767577', true: '#34C759' }}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>CLOUD STORAGE</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View>
                <Text style={styles.rowText}>Total Media</Text>
                <Text style={styles.subText}>{loadingStats ? 'Loading...' : `${stats?.total_items || 0} Items`}</Text>
              </View>
            </View>
            <View style={[styles.row, styles.noBorder]}>
              <View>
                <Text style={styles.rowText}>Space Used</Text>
                <Text style={styles.subText}>{loadingStats ? 'Loading...' : formatBytes(stats?.total_size || 0)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowText}>App Version</Text>
              <Text style={styles.subText}>1.0.0</Text>
            </View>
            <TouchableOpacity style={[styles.row, styles.noBorder]} onPress={() => Alert.alert('About', 'Own-Gallery v1.0\n\nDeveloped by Girdhar Agrawal.')}>
              <Text style={styles.rowText}>About</Text>
              <ChevronRight size={20} color="#c7c7cc" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editProfileVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First Name"
            />

            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last Name"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="Email Address"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setEditProfileVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalBtn} onPress={handleUpdateProfile} disabled={isUpdating}>
                {isUpdating ? <ActivityIndicator size="small" color="#007AFF" /> : <Text style={[styles.modalBtnText, { color: '#007AFF', fontWeight: 'bold' }]}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              placeholder="Current Password"
            />

            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="New Password (min 8 chars)"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setPasswordVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalBtn} onPress={handleUpdatePassword} disabled={isUpdating}>
                {isUpdating ? <ActivityIndicator size="small" color="#007AFF" /> : <Text style={[styles.modalBtnText, { color: '#007AFF', fontWeight: 'bold' }]}>Update</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 24, color: '#000' },

  section: { marginBottom: 24 },
  sectionHeader: { fontSize: 13, color: '#8e8e93', marginBottom: 8, paddingLeft: 16, fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c6c6c8',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 12,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  rowText: {
    fontSize: 17,
    color: '#000',
  },
  subText: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 2,
  },
  rowValue: {
    fontSize: 17,
    color: '#8e8e93',
  },
  editBtn: {
    padding: 8,
  },

  logoutButton: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    marginTop: 16,
  },
  logoutText: {
    fontSize: 17,
    color: '#ff3b30',
    fontWeight: '600'
  },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#111' },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, color: '#000' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, marginTop: 8 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  modalBtnText: { fontSize: 16, color: '#555' },
});
