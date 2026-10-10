import React, { useCallback, useEffect, useState } from 'react';
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
  ActivityIndicator,
  AppState,
  Linking,
} from 'react-native';
import RNFS from 'react-native-fs';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { updateProfile, changePassword } from '../../api/auth';
import { getStats, type MediaStats } from '../../api/media';
import { getSettings, updateSettings } from '../../api/settings';
import { formatBytes } from '../../utils/format';
import {
  type BackupFolder,
  type BackupStatus,
  getAutoBackupStatus,
  getBackupFolders,
  isAutoBackupAvailable,
  requestMediaAccess,
  runAutoBackupNow,
  setBackupFolders,
  updateAutoBackupSettings,
} from '../../services/AutoBackupService';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, LogOut, User, Lock, Edit3 } from 'lucide-react-native';

// Thumbnails/previews are cached natively (Fresco / RCTImageLoader) and videos/shares
// are downloaded into the app cache directory, so walk it recursively.
// Only files are removed; directories stay so native caches keep working.
const walkCache = async (dir: string, onFile: (file: RNFS.ReadDirItem) => Promise<void> | void) => {
  let entries: RNFS.ReadDirItem[] = [];
  try {
    entries = await RNFS.readDir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await walkCache(entry.path, onFile);
    } else if (entry.isFile()) {
      await onFile(entry);
    }
  }
};

const describeBackup = (status: BackupStatus | null): string => {
  if (!isAutoBackupAvailable) return 'Available on Android';
  if (!status) return 'Loading…';
  if (!status.enabled) return 'Off';
  if (!status.signedIn) return 'Sign in to back up';
  if (!status.permissionGranted) return 'Allow photo access to back up';
  if (status.state === 'running') return 'Backing up…';
  if (status.lastResult === 'error' && status.lastError) return `Will retry: ${status.lastError}`;
  if (status.lastResult === 'paused' && status.lastError) return `Paused: ${status.lastError}`;
  if (status.lastSuccessAt > 0) {
    return `Up to date · ${new Date(status.lastSuccessAt).toLocaleString()}`;
  }
  return status.wifiOnly ? 'On · runs when connected to Wi-Fi' : 'On · waiting to run';
};

const SettingsScreen = () => {
  const { user, setUser, logout } = useAuth();
  const navigation = useNavigation<any>();

  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name || '');

  const [lastName, setLastName] = useState(user?.last_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [cacheSize, setCacheSize] = useState('…');
  const [isClearingCache, setIsClearingCache] = useState(false);
  
  const { mode: theme, setMode: setTheme, colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [stats, setStats] = useState<MediaStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Auto Backup settings live natively (WorkManager + SharedPreferences); this screen only
  // reads and changes them.
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [foldersVisible, setFoldersVisible] = useState(false);
  const [folders, setFolders] = useState<BackupFolder[]>([]);

  const openFolders = async () => {
    try {
      const list = await getBackupFolders();
      if (list.length === 0) {
        Alert.alert('No folders', 'Allow photo access first so Own Gallery can see your folders.');
        return;
      }
      setFolders(list);
      setFoldersVisible(true);
    } catch (e: any) {
      Alert.alert('Folders', e?.message || 'Could not read device folders');
    }
  };

  const saveFolders = async () => {
    const chosen = folders.filter(f => f.selected);
    if (chosen.length === 0) {
      Alert.alert('Choose a folder', 'Select at least one folder to back up.');
      return;
    }
    // Everything selected = "all folders", so folders created later are included too.
    const ids = chosen.length === folders.length ? [] : chosen.map(f => f.id);
    try {
      await setBackupFolders(ids);
      updateSettings({ backup_folders: ids }).catch(() => {});
      setFoldersVisible(false);
      ToastAndroid.show('Backup folders updated', ToastAndroid.SHORT);
    } catch (e: any) {
      Alert.alert('Folders', e?.message || 'Could not save folders');
    } finally {
      refreshBackupStatus();
    }
  };

  const refreshBackupStatus = useCallback(async () => {
    try {
      setBackupStatus(await getAutoBackupStatus());
    } catch (e) {
      console.error('Failed to read auto backup status', e);
    }
  }, []);

  React.useEffect(() => {
    calculateCacheSize();
    fetchStats();

    getSettings().then(async (settings) => {
      if (settings.theme) setTheme(settings.theme as any);

      if (isAutoBackupAvailable) {
        const localBackup = await getAutoBackupStatus();
        if (
          localBackup.enabled !== settings.backup_enabled ||
          localBackup.wifiOnly !== settings.backup_wifi_only ||
          localBackup.chargingOnly !== settings.backup_charging_only
        ) {
           await updateAutoBackupSettings({
             enabled: settings.backup_enabled,
             wifiOnly: settings.backup_wifi_only,
             chargingOnly: settings.backup_charging_only,
           });
           refreshBackupStatus();
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAutoBackupAvailable) return;
    refreshBackupStatus();
    const timer = setInterval(refreshBackupStatus, 5000);
    // Permissions may have changed in system settings while the app was in the background.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshBackupStatus();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refreshBackupStatus]);

  const changeBackupSettings = async (change: Partial<Pick<BackupStatus, 'enabled' | 'wifiOnly' | 'chargingOnly'>>) => {
    if (!backupStatus || backupBusy) return;
    const next = {
      enabled: change.enabled ?? backupStatus.enabled,
      wifiOnly: change.wifiOnly ?? backupStatus.wifiOnly,
      chargingOnly: change.chargingOnly ?? backupStatus.chargingOnly,
    };

    if (next.enabled && !backupStatus.enabled) {
      const access = await requestMediaAccess();
      if (access === 'denied') {
        Alert.alert(
          'Photo access needed',
          'Allow Own Gallery to access photos and videos so it can back them up.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      if (access === 'partial') {
        ToastAndroid.show('Only the photos you selected will be backed up', ToastAndroid.LONG);
      }
    }

    setBackupBusy(true);
    setBackupStatus({ ...backupStatus, ...next });
    try {
      await updateAutoBackupSettings(next);
      updateSettings({
        backup_enabled: next.enabled,
        backup_wifi_only: next.wifiOnly,
        backup_charging_only: next.chargingOnly,
      }).catch(() => {});
      
      if (change.enabled !== undefined) {
        ToastAndroid.show(next.enabled ? 'Auto Backup on' : 'Auto Backup off', ToastAndroid.SHORT);
      }
    } catch (e: any) {
      Alert.alert('Auto Backup', e?.message || 'Could not update backup settings');
    } finally {
      setBackupBusy(false);
      refreshBackupStatus();
    }
  };

  const backUpNow = async () => {
    try {
      await runAutoBackupNow();
      ToastAndroid.show('Backup will start when conditions allow', ToastAndroid.SHORT);
    } finally {
      refreshBackupStatus();
    }
  };

  const fetchStats = async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const calculateCacheSize = async () => {
    try {
      let totalSize = 0;
      await walkCache(RNFS.CachesDirectoryPath, file => {
        totalSize += Number(file.size) || 0;
      });
      setCacheSize(formatBytes(totalSize));
    } catch (e) {
      console.error('Error calculating cache size:', e);
    }
  };

  const clearCache = async () => {
    setIsClearingCache(true);
    try {
      await walkCache(RNFS.CachesDirectoryPath, async file => {
        await RNFS.unlink(file.path).catch(() => {});
      });
      await calculateCacheSize();
      ToastAndroid.show('Cache cleared', ToastAndroid.SHORT);
    } catch {
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
      console.error('Update profile error:', error?.response?.data);
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollContent}>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <User size={20} color={colors.primary} style={styles.rowIcon} />
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
                <Edit3 size={18} color={colors.primary} />
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
              <ChevronRight size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.onSurfaceVariant }]}>PREFERENCES</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.rowText, { color: colors.onSurface }]}>Theme</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {['system', 'light', 'dark'].map((t) => (
                  <TouchableOpacity key={t} onPress={() => setTheme(t as any)}>
                    <Text style={{
                      color: theme === t ? colors.primary : colors.onSurfaceVariant,
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
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.error }}>Clear Cache</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>AUTO BACKUP</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowText}>Back up photos & videos</Text>
                <Text style={styles.subText}>{describeBackup(backupStatus)}</Text>
                {backupStatus?.enabled && backupStatus.backedUpCount > 0 && (
                  <Text style={styles.subText}>{backupStatus.backedUpCount} items backed up from this device</Text>
                )}
                {backupStatus?.enabled && backupStatus.currentName !== '' && (
                  <Text style={styles.subText} numberOfLines={1}>
                    Uploading {backupStatus.currentName} · {backupStatus.currentPercent}%
                  </Text>
                )}
                {backupStatus?.enabled && backupStatus.pendingCount > 0 && (
                  <Text style={styles.subText}>
                    {backupStatus.pendingCount} in upload queue · {formatBytes(backupStatus.pendingBytes)}
                  </Text>
                )}
                {backupStatus?.enabled && backupStatus.skippedCount > 0 && (
                  <Text style={styles.subText}>{backupStatus.skippedCount} skipped (unsupported or too large)</Text>
                )}
              </View>
              <Switch
                value={backupStatus?.enabled ?? false}
                onValueChange={value => changeBackupSettings({ enabled: value })}
                disabled={!backupStatus || backupBusy}
                trackColor={{ false: '#767577', true: '#34C759' }}
              />
            </View>
            <View style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowText}>Wi-Fi only</Text>
                <Text style={styles.subText}>Don't use mobile data for backup</Text>
              </View>
              <Switch
                value={backupStatus?.wifiOnly ?? true}
                onValueChange={value => changeBackupSettings({ wifiOnly: value })}
                disabled={!backupStatus || backupBusy}
                trackColor={{ false: '#767577', true: '#34C759' }}
              />
            </View>
            <View style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowText}>Only while charging</Text>
                <Text style={styles.subText}>Back up when the phone is plugged in</Text>
              </View>
              <Switch
                value={backupStatus?.chargingOnly ?? false}
                onValueChange={value => changeBackupSettings({ chargingOnly: value })}
                disabled={!backupStatus || backupBusy}
                trackColor={{ false: '#767577', true: '#34C759' }}
              />
            </View>
            <TouchableOpacity
              style={[styles.row, !backupStatus?.enabled && styles.noBorder]}
              onPress={openFolders}
              disabled={!backupStatus}
            >
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowText}>Folders to back up</Text>
                <Text style={styles.subText}>
                  {backupStatus && backupStatus.selectedFolderCount > 0
                    ? `${backupStatus.selectedFolderCount} selected`
                    : 'All folders (Camera, Screenshots, WhatsApp, Downloads…)'}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            {backupStatus?.enabled && (
              <TouchableOpacity style={[styles.row, styles.noBorder]} onPress={backUpNow}>
                <Text style={[styles.rowText, { color: colors.primary }]}>Back up now</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>UTILITIES</Text>
          <View style={styles.card}>
            <TouchableOpacity style={[styles.row, styles.noBorder]} onPress={() => navigation.navigate('PrivatePin')}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Lock size={20} color={colors.onSurface} style={{ marginRight: 12 }} />
                <View>
                  <Text style={styles.rowText}>Locked Folder</Text>
                  <Text style={styles.subText}>Keep sensitive photos hidden and protected</Text>
                </View>
              </View>
              <ChevronRight size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>CLOUD STORAGE</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowText}>Space Used</Text>
                <Text style={styles.subText}>
                  {loadingStats
                    ? 'Loading...'
                    : `${formatBytes(stats?.total_size || 0)} · ${stats?.total_items || 0} items`}
                </Text>
                {!loadingStats && (stats?.total_size ?? 0) > 0 && (
                  <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8, backgroundColor: colors.surfaceVariant }}>
                    <View style={{ flex: stats!.photo_size, backgroundColor: colors.primary }} />
                    <View style={{ flex: stats!.video_size, backgroundColor: '#FF9500' }} />
                  </View>
                )}
              </View>
            </View>
            <View style={styles.row}>
              <View>
                <Text style={styles.rowText}>Photos</Text>
                <Text style={styles.subText}>
                  {loadingStats ? 'Loading...' : `${stats?.photo_count || 0} · ${formatBytes(stats?.photo_size || 0)}`}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <View>
                <Text style={styles.rowText}>Videos</Text>
                <Text style={styles.subText}>
                  {loadingStats ? 'Loading...' : `${stats?.video_count || 0} · ${formatBytes(stats?.video_size || 0)}`}
                </Text>
              </View>
            </View>
            <View style={[styles.row, styles.noBorder]}>
              <View>
                <Text style={styles.rowText}>Trash</Text>
                <Text style={styles.subText}>
                  {loadingStats ? 'Loading...' : `${stats?.trash_count || 0} · ${formatBytes(stats?.trash_size || 0)}`}
                </Text>
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
              <ChevronRight size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Backup folders Modal */}
      <Modal visible={foldersVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '75%' }]}>
            <Text style={styles.modalTitle}>Folders to back up</Text>
            <ScrollView>
              {folders.map(folder => (
                <View key={folder.id} style={styles.row}>
                  <View style={styles.rowTextBlock}>
                    <Text style={styles.rowText}>{folder.name}</Text>
                    <Text style={styles.subText}>
                      {folder.total} items{folder.pending > 0 ? ` · ${folder.pending} not backed up` : ' · backed up'}
                    </Text>
                  </View>
                  <Switch
                    value={folder.selected}
                    onValueChange={value =>
                      setFolders(prev => prev.map(f => (f.id === folder.id ? { ...f, selected: value } : f)))
                    }
                    trackColor={{ false: '#767577', true: '#34C759' }}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setFoldersVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalBtn} onPress={saveFolders}>
                <Text style={[styles.modalBtnText, { color: colors.primary, fontWeight: 'bold' }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                {isUpdating ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.modalBtnText, { color: colors.primary, fontWeight: 'bold' }]}>Save</Text>}
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
                {isUpdating ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.modalBtnText, { color: colors.primary, fontWeight: 'bold' }]}>Update</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

export default SettingsScreen;

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  rowTextBlock: { flex: 1, marginRight: 12 },
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: 16, paddingTop:   50 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 24, color: colors.onBackground },

  section: { marginBottom: 24 },
  sectionHeader: { fontSize: 13, color: colors.onSurfaceVariant, marginBottom: 8, paddingLeft: 16, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
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
    borderBottomColor: colors.border,
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
    color: colors.onBackground,
  },
  subText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 17,
    color: colors.onSurfaceVariant,
  },
  editBtn: {
    padding: 8,
  },

  logoutButton: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    marginTop: 16,
  },
  logoutText: {
    fontSize: 17,
    color: colors.error,
    fontWeight: '600'
  },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: colors.onSurface },
  label: { fontSize: 14, fontWeight: '600', color: colors.onSurfaceVariant, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, color: colors.onBackground },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 8 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  modalBtnText: { fontSize: 16, color: colors.onSurfaceVariant },
});
