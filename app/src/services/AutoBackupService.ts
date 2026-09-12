import BackgroundActions from 'react-native-background-actions';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { uploadMedia } from '../api/media';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));

const BACKUP_SYNC_KEY = '@backup_sync_status';
export const BACKUP_WIFI_ONLY_KEY = '@backup_wifi_only';

export const startAutoBackup = async () => {
    const options = {
        taskName: 'AutoBackup',
        taskTitle: 'Own Gallery Backup',
        taskDesc: 'Syncing your photos to the cloud...',
        taskIcon: {
            name: 'ic_launcher',
            type: 'mipmap',
        },
        color: '#007AFF',
        parameters: {
            delay: 15000, // Sync every 15 seconds while running
        },
    };

    if (!BackgroundActions.isRunning()) {
        await BackgroundActions.start(backupTask, options);
    }
};

export const stopAutoBackup = async () => {
    await BackgroundActions.stop();
};

const backupTask = async (taskDataArguments: any) => {
    const { delay } = taskDataArguments;

    while (BackgroundActions.isRunning()) {
        try {
            await syncPhotos();
        } catch (e) {
            console.error("Backup task error:", e);
        }
        await sleep(delay);
    }
};

const syncPhotos = async () => {
    // 0. Check network conditions
    const wifiOnlyStr = await AsyncStorage.getItem(BACKUP_WIFI_ONLY_KEY);
    const wifiOnly = wifiOnlyStr === 'true';

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) return;
    
    if (wifiOnly && netInfo.type !== 'wifi') {
        console.log("Auto-backup paused: Waiting for Wi-Fi.");
        return;
    }

    // 1. Get last synced timestamp
    const lastSyncStr = await AsyncStorage.getItem(BACKUP_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

    // 2. Fetch photos from Camera Roll newer than lastSync
    const photos = await CameraRoll.getPhotos({
        first: 50,
        assetType: 'All',
        include: ['filename', 'fileSize'],
    });

    if (photos.edges.length === 0) return;

    let newestTimestamp = lastSync;

    for (const edge of photos.edges) {
        const photo = edge.node;
        const timestamp = photo.timestamp * 1000; // CameraRoll returns seconds
        
        if (timestamp > lastSync) {
            console.log(`Uploading new photo: ${photo.image.filename}`);
            try {
                await uploadMedia(
                    photo.image.uri,
                    photo.image.filename || `upload_${Date.now()}`,
                    photo.type || 'image/jpeg',
                    () => {},
                    new Date(timestamp).toISOString()
                );
                
                if (timestamp > newestTimestamp) {
                    newestTimestamp = timestamp;
                }
            } catch (err) {
                console.error(`Failed to upload ${photo.image.filename}`, err);
            }
        }
    }

    if (newestTimestamp > lastSync) {
        await AsyncStorage.setItem(BACKUP_SYNC_KEY, newestTimestamp.toString());
    }
};
