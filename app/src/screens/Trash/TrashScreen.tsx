import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ToastAndroid,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';

import MediaGrid from '../../components/MediaGrid';
import { getTrashMedia, restoreFromTrash, permanentDelete, emptyTrash } from '../../api/media';
import { Media } from '../../types/media';

const TrashScreen = () => {
    const insets = useSafeAreaInsets();

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(false);

    const fetchTrash = useCallback(async () => {
        try {
            const data = await getTrashMedia();
            setMedia(data);
        } catch (err) {
            console.log('Failed to fetch trash', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setBusy(false);
        }
    }, []);

    // Loads on first focus and refreshes whenever the tab regains focus
    // (items trashed from other tabs show up).
    useFocusEffect(useCallback(() => {
        fetchTrash();
    }, [fetchTrash]));

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTrash();
    }, [fetchTrash]);

    const handleEmptyTrash = () => {
        if (media.length === 0) { return; }

        Alert.alert(
            'Empty Trash',
            'Are you sure you want to permanently delete all items? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Empty Trash',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await emptyTrash();
                            ToastAndroid.show('Trash emptied', ToastAndroid.SHORT);
                            fetchTrash();
                        } catch {
                            Alert.alert('Error', 'Failed to empty trash');
                            setBusy(false);
                        }
                    },
                },
            ],
        );
    };

    const handleItemOptions = useCallback((item: Media) => {
        Alert.alert('Trash Options', 'What would you like to do with this item?', [
            {
                text: 'Restore',
                onPress: async () => {
                    try {
                        await restoreFromTrash(item.id);
                        ToastAndroid.show('Item restored', ToastAndroid.SHORT);
                        setMedia(prev => prev.filter(m => m.id !== item.id));
                    } catch {
                        Alert.alert('Error', 'Failed to restore item');
                    }
                },
            },
            {
                text: 'Delete Permanently',
                style: 'destructive',
                onPress: () => {
                    Alert.alert('Confirm Delete', 'Permanently delete this item?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Delete', style: 'destructive', onPress: async () => {
                                try {
                                    await permanentDelete(item.id);
                                    ToastAndroid.show('Item permanently deleted', ToastAndroid.SHORT);
                                    setMedia(prev => prev.filter(m => m.id !== item.id));
                                } catch {
                                    Alert.alert('Error', 'Failed to delete item');
                                }
                            },
                        },
                    ]);
                },
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    }, []);

    const renderCellOverlay = useCallback((item: Media) => (
        <View style={styles.trashOverlay}>
            <Text style={styles.trashOverlayText} numberOfLines={1}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Deleted'}
            </Text>
        </View>
    ), []);

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <View>
                    <Text style={styles.heading}>Trash</Text>
                    <Text style={styles.subheading}>{media.length} items</Text>
                </View>
                <TouchableOpacity onPress={handleEmptyTrash} disabled={media.length === 0 || busy}>
                    <Text style={[styles.emptyBtnText, (media.length === 0 || busy) && styles.emptyBtnDisabled]}>Empty</Text>
                </TouchableOpacity>
            </View>

            <MediaGrid
                media={media}
                groupByDate={false}
                showFavoriteBadge={false}
                onPressItem={handleItemOptions}
                renderCellOverlay={renderCellOverlay}
                loading={loading}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomPadding={insets.bottom + 100}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Trash2 size={64} color="#ccc" style={styles.emptyIcon} />
                        <Text style={styles.emptyTitle}>Trash is empty</Text>
                    </View>
                }
            />

            {busy && (
                <View style={styles.busyOverlay}>
                    <ActivityIndicator size="large" color="#1a73e8" />
                </View>
            )}
        </View>
    );
};

export default TrashScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: '#fff',
    },
    heading: { fontSize: 28, fontWeight: '700', color: '#3c4043', letterSpacing: -0.5 },
    subheading: { fontSize: 13, color: '#5f6368', marginTop: 2 },
    emptyBtnText: { color: '#1a73e8', fontSize: 16, fontWeight: '600' },
    emptyBtnDisabled: { color: '#8ab4f8' },

    trashOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 3 },
    trashOverlayText: { color: '#fff', fontSize: 10, textAlign: 'center' },

    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#3c4043', marginBottom: 8 },

    busyOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
