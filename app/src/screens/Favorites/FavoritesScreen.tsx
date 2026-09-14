import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart } from 'lucide-react-native';

import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from '../Gallery/MediaViewer';
import { getMedia } from '../../api/media';
import { Media } from '../../types/media';

const FavoritesScreen = () => {
    const insets = useSafeAreaInsets();
    const gridRef = useRef<MediaGridHandle>(null);

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);
    const hasLoadedRef = useRef(false);
    const viewerOpenRef = useRef(false);

    const fetchFavorites = useCallback(async (pageNumber: number) => {
        if (pageNumber > 1 && busyRef.current) { return; }
        busyRef.current = true;
        if (pageNumber > 1) { setLoadingMore(true); }
        try {
            const data = await getMedia({ page: pageNumber, isFavorite: true });
            setMedia(prev => {
                if (pageNumber === 1) { return data.results; }
                const existing = new Set(prev.map(m => m.id));
                return [...prev, ...data.results.filter(m => !existing.has(m.id))];
            });
            pageRef.current = pageNumber;
            hasMoreRef.current = !!data.next;
            hasLoadedRef.current = true;
        } catch (err) {
            console.log('Failed to fetch favorites', err);
        } finally {
            busyRef.current = false;
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        fetchFavorites(1);
    }, [fetchFavorites]);

    // Favorites change from other tabs: refresh quietly when the tab regains focus.
    useFocusEffect(useCallback(() => {
        if (hasLoadedRef.current && !viewerOpenRef.current) {
            fetchFavorites(1);
        }
    }, [fetchFavorites]));

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchFavorites(1);
    }, [fetchFavorites]);

    const onEndReached = useCallback(() => {
        if (hasMoreRef.current) {
            fetchFavorites(pageRef.current + 1);
        }
    }, [fetchFavorites]);

    const openViewer = useCallback((_item: Media, index: number) => {
        if (index < 0) { return; }
        viewerOpenRef.current = true;
        setSelectedIndex(index);
        setViewerVisible(true);
    }, []);

    const handleViewerClose = useCallback((lastIndex: number) => {
        viewerOpenRef.current = false;
        setViewerVisible(false);
        const last = media[lastIndex];
        // Items un-favorited in the viewer are kept until it closes so pages don't shift.
        setMedia(prev => prev.filter(m => m.is_favorite));
        if (last?.is_favorite) {
            requestAnimationFrame(() => gridRef.current?.scrollToMedia(last.id));
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
                <Text style={styles.heading}>Favorites</Text>
            </View>

            <MediaGrid
                ref={gridRef}
                media={media}
                showFavoriteBadge={false}
                onPressItem={openViewer}
                loading={loading}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onEndReached={onEndReached}
                loadingMore={loadingMore}
                bottomPadding={insets.bottom + 100}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Heart size={64} color="#ccc" style={styles.emptyIcon} />
                        <Text style={styles.emptyTitle}>No favorites yet</Text>
                    </View>
                }
            />

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={handleViewerClose}
                onMediaUpdated={handleMediaUpdated}
                onMediaDeleted={handleMediaDeleted}
            />
        </View>
    );
};

export default FavoritesScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#fff' },
    heading: { fontSize: 28, fontWeight: '700', color: '#3c4043', letterSpacing: -0.5 },
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#3c4043', marginBottom: 8 },
});
