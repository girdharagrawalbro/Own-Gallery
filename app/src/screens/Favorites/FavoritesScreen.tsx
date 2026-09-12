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
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ImageOff, Heart, Info } from 'lucide-react-native';

import AuthenticatedImage from '../../components/AuthenticatedImage';
import VideoThumbnail from '../../components/VideoThumbnail';
import MediaViewer from '../Gallery/MediaViewer';
import { getMedia } from '../../api/media';
import { Media } from '../../types/media';

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

const FavoritesScreen = () => {
    const navigation = useNavigation();
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const fetchFavorites = async (pageNumber: number, isRefresh = false) => {
        try {
            const data = await getMedia(pageNumber, true);
            if (isRefresh || pageNumber === 1) {
                setMedia(data.results);
            } else {
                setMedia(prev => [...prev, ...data.results]);
            }
            setPage(pageNumber);
            setHasMore(!!data.next);
        } catch (err) {
            console.log('Failed to fetch favorites', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchFavorites(1, true);
        });
        return unsubscribe;
    }, [navigation]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchFavorites(1, true);
    }, []);

    const onEndReached = useCallback(() => {
        if (!loading && !refreshing && hasMore) {
            fetchFavorites(page + 1);
        }
    }, [loading, refreshing, hasMore, page]);

    const openViewer = useCallback((index: number) => {
        setSelectedIndex(index);
        setViewerVisible(true);
    }, []);

    const renderItem = useCallback(({ item, index }: { item: Media; index: number }) => (
        <Pressable
            style={styles.cell}
            onPress={() => openViewer(index)}
            android_ripple={{ color: 'rgba(255,255,255,0.3)' }}>
            {item.media_type === 'video' ? (
                <VideoThumbnail thumbnailUrl={item.thumbnail_url} duration={item.duration} />
            ) : item.thumbnail_url ? (
                <AuthenticatedImage uri={item.thumbnail_url} style={styles.cellImage} resizeMode="cover" />
            ) : (
                <View style={styles.noThumb}><ImageOff size={24} color="#ccc" /></View>
            )}

            {item.is_favorite && (
                <View style={styles.favoriteBadge}>
                    <Heart size={12} color="#FF3B30" fill="#FF3B30" />
                </View>
            )}
        </Pressable>
    ), [openViewer]);

    const keyExtractor = useCallback((item: Media) => item.id.toString(), []);

    if (loading) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#FF3B30" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.heading}>Favorites</Text>
            </View>

            <FlatList
                data={media}
                numColumns={3}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Heart size={64} color="#ccc" style={{ marginBottom: 16 }} />
                        <Text style={styles.emptyTitle}>No favorites yet</Text>
                    </View>
                }
                getItemLayout={(_, index) => ({
                    length: CELL,
                    offset: CELL * Math.floor(index / 3),
                    index,
                })}
            />

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={() => {
                    setViewerVisible(false);
                    fetchFavorites(1, true); // Refresh in case they unfavorited
                }}
                onMediaUpdated={(updatedMedia) => {
                    if (!updatedMedia.is_favorite) {
                        setMedia(prev => prev.filter(m => m.id !== updatedMedia.id));
                    }
                }}
                onMediaDeleted={(deletedId) => {
                    setMedia(prev => prev.filter(m => m.id !== deletedId));
                }}
            />
        </SafeAreaView>
    );
};

export default FavoritesScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    heading: { fontSize: 22, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
    cell: { width: CELL, height: CELL, margin: 0.5, backgroundColor: '#eee', overflow: 'hidden' },
    cellImage: { width: '100%', height: '100%' },
    noThumb: { flex: 1, backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
    noThumbIcon: { fontSize: 24 }, // Keeping just in case
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 8 },
    favoriteBadge: { position: 'absolute', bottom: 4, right: 4, padding: 2 },
    heartIcon: { fontSize: 12 }, // Keeping just in case
});
