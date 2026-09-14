import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    ToastAndroid,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Image as ImageIcon, Plus } from 'lucide-react-native';
import { launchImageLibrary, Asset } from 'react-native-image-picker';

import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from '../Gallery/MediaViewer';
import AddMediaModal from './AddMediaModal';
import UploadPreviewModal from '../Gallery/UploadPreviewModal';
import { getAlbumMedia, removeMediaFromAlbum } from '../../api/albums';
import { Media } from '../../types/media';
import { useUploadActions } from '../../context/UploadContext';

const AlbumDetailScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { albumId, albumName } = route.params;
    const { completedVersion } = useUploadActions();
    const gridRef = useRef<MediaGridHandle>(null);

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploadAssets, setUploadAssets] = useState<Asset[]>([]);

    const fetchMedia = useCallback(async () => {
        try {
            const data = await getAlbumMedia(albumId);
            setMedia(data.media);
        } catch (err) {
            console.log('Failed to fetch album media', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [albumId]);

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    // Uploads into this album finished processing.
    useEffect(() => {
        if (completedVersion > 0) {
            fetchMedia();
        }
    }, [completedVersion, fetchMedia]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchMedia();
    }, [fetchMedia]);

    const handleAddPress = () => {
        Alert.alert('Add Media to Album', 'Choose a source', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Select from Gallery', onPress: () => setAddModalVisible(true) },
            {
                text: 'Upload from Device',
                onPress: async () => {
                    const result = await launchImageLibrary({
                        mediaType: 'mixed',
                        selectionLimit: 0,
                        includeExtra: true,
                    });
                    if (result.assets && result.assets.length > 0) {
                        setUploadAssets(result.assets);
                        setUploadModalVisible(true);
                    }
                },
            },
        ]);
    };

    const openViewer = useCallback((_item: Media, index: number) => {
        if (index < 0) { return; }
        setSelectedIndex(index);
        setViewerVisible(true);
    }, []);

    const handleLongPress = useCallback((item: Media) => {
        Alert.alert('Remove Media', 'Do you want to remove this item from the album?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await removeMediaFromAlbum(albumId, [item.id]);
                        ToastAndroid.show('Removed from album', ToastAndroid.SHORT);
                        setMedia(prev => prev.filter(m => m.id !== item.id));
                    } catch {
                        Alert.alert('Error', 'Failed to remove media');
                    }
                },
            },
        ]);
    }, [albumId]);

    const handleViewerClose = useCallback((lastIndex: number) => {
        setViewerVisible(false);
        const item = media[lastIndex];
        if (item) {
            requestAnimationFrame(() => gridRef.current?.scrollToMedia(item.id));
        }
    }, [media]);

    const handleMediaUpdated = useCallback((updated: Media) => {
        setMedia(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    }, []);

    const handleMediaDeleted = useCallback((deletedId: number) => {
        setMedia(prev => prev.filter(m => m.id !== deletedId));
    }, []);

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
                    <ChevronLeft size={28} color="#1a73e8" />
                </TouchableOpacity>
                <View style={styles.titleBlock}>
                    <Text style={styles.heading} numberOfLines={1}>{albumName}</Text>
                    {!loading && <Text style={styles.subheading}>{media.length} items</Text>}
                </View>
                <View style={styles.spacer} />
            </View>

            <MediaGrid
                ref={gridRef}
                media={media}
                onPressItem={openViewer}
                onLongPressItem={handleLongPress}
                loading={loading}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomPadding={insets.bottom + 100}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <ImageIcon size={64} color="#ccc" style={styles.emptyIcon} />
                        <Text style={styles.emptyTitle}>Empty Album</Text>
                    </View>
                }
            />

            <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom + 16, 16) }]} onPress={handleAddPress}>
                <Plus size={28} color="#fff" />
            </TouchableOpacity>

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={handleViewerClose}
                onMediaUpdated={handleMediaUpdated}
                onMediaDeleted={handleMediaDeleted}
            />

            <AddMediaModal
                visible={addModalVisible}
                albumId={albumId}
                onClose={() => setAddModalVisible(false)}
                onAdded={onRefresh}
            />

            <UploadPreviewModal
                visible={uploadModalVisible}
                assets={uploadAssets}
                albumId={albumId}
                onClose={() => setUploadModalVisible(false)}
                onUploadComplete={() => {}}
            />
        </View>
    );
};

export default AlbumDetailScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: '#fff',
    },
    backBtn: { padding: 8, marginLeft: -8 },
    titleBlock: { flex: 1, alignItems: 'center' },
    heading: { fontSize: 20, fontWeight: '500', color: '#3c4043', textAlign: 'center' },
    subheading: { fontSize: 12, color: '#5f6368', marginTop: 2 },
    spacer: { width: 36 },

    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#3c4043', marginBottom: 8 },

    fab: {
        position: 'absolute',
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#1a73e8',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
    },
});
