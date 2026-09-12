import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Pressable,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Alert,
    ToastAndroid,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ImageOff, Image as ImageIcon, Plus, Info, ChevronLeft } from 'lucide-react-native';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import VideoThumbnail from '../../components/VideoThumbnail';
import MediaViewer from '../Gallery/MediaViewer';
import AddMediaModal from './AddMediaModal';
import { getAlbumMedia, removeMediaFromAlbum } from '../../api/albums';
import { Media } from '../../types/media';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import UploadPreviewModal from '../Gallery/UploadPreviewModal';

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

const AlbumDetailScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { albumId, albumName } = route.params;

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploadAssets, setUploadAssets] = useState<Asset[]>([]);

    const fetchMedia = async () => {
        try {
            const data = await getAlbumMedia(albumId);
            setMedia(data.media);
        } catch (err) {
            console.log('Failed to fetch album media', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchMedia();
    }, [albumId]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchMedia();
    }, []);

    const handleAddPress = () => {
        Alert.alert(
            'Add Media to Album',
            'Choose a source',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Select from Gallery',
                    onPress: () => setAddModalVisible(true)
                },
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
                    }
                }
            ]
        );
    };

    const openViewer = useCallback((index: number) => {
        setSelectedIndex(index);
        setViewerVisible(true);
    }, []);

    const handleLongPress = (item: Media) => {
        Alert.alert(
            'Remove Media',
            'Do you want to remove this item from the album?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await removeMediaFromAlbum(albumId, [item.id]);
                            ToastAndroid.show('Removed from album', ToastAndroid.SHORT);
                            onRefresh();
                        } catch (err) {
                            Alert.alert('Error', 'Failed to remove media');
                        }
                    }
                }
            ]
        );
    };

    const renderItem = useCallback(({ item, index }: { item: Media; index: number }) => (
        <Pressable
            style={styles.cell}
            onPress={() => openViewer(index)}
            onLongPress={() => handleLongPress(item)}
            android_ripple={{ color: 'rgba(255,255,255,0.3)' }}>
            {item.media_type === 'video' ? (
                <VideoThumbnail thumbnailUrl={item.thumbnail_url} duration={item.duration} />
            ) : item.thumbnail_url ? (
                <AuthenticatedImage uri={item.thumbnail_url} style={styles.cellImage} resizeMode="cover" />
            ) : (
                <View style={styles.noThumb}><ImageOff size={24} color="#ccc" /></View>
            )}
        </Pressable>
    ), [openViewer]);

    const keyExtractor = useCallback((item: Media) => item.id.toString(), []);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={28} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.heading} numberOfLines={1}>{albumName}</Text>
                <View style={styles.spacer} />
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            ) : (
                <FlatList
                    data={media}
                    numColumns={3}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <ImageIcon size={64} color="#ccc" style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyTitle}>Empty Album</Text>
                        </View>
                    }
                    getItemLayout={(_, index) => ({
                        length: CELL,
                        offset: CELL * Math.floor(index / 3),
                        index,
                    })}
                />
            )}

            <TouchableOpacity style={styles.fab} onPress={handleAddPress}>
                <Plus size={32} color="#fff" />
            </TouchableOpacity>

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={() => setViewerVisible(false)}
                onMediaUpdated={(updatedMedia) => {
                    setMedia(prev => prev.map(m => m.id === updatedMedia.id ? updatedMedia : m));
                }}
                onMediaDeleted={(deletedId) => {
                    setMedia(prev => prev.filter(m => m.id !== deletedId));
                }}
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
                onUploadComplete={onRefresh}
            />
        </SafeAreaView>
    );
};

export default AlbumDetailScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    backBtn: { padding: 8, marginLeft: -8 },
    backText: { color: '#007AFF', fontSize: 16 },
    heading: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
    spacer: { width: 50 },
    cell: { width: CELL, height: CELL, margin: 0.5, backgroundColor: '#eee', overflow: 'hidden' },
    cellImage: { width: '100%', height: '100%' },
    noThumb: { flex: 1, backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
    noThumbIcon: { fontSize: 24 }, // Keeping just in case
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 8 },
    fab: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
    fabText: { color: '#fff', fontSize: 22, fontWeight: '400', marginTop: -2 },
});
