import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, ArrowLeft, Unlock } from 'lucide-react-native';

import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from '../Gallery/MediaViewer';
import { getMedia, bulkUnprivate } from '../../api/media';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { Media } from '../../types/media';

const PrivateGalleryScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const gridRef = useRef<MediaGridHandle>(null);

    const privateToken = route.params?.privateToken;

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);
    const viewerOpenRef = useRef(false);

    useEffect(() => {
        if (!privateToken) {
            Alert.alert('Error', 'Missing private token.');
            navigation.goBack();
        }
    }, [privateToken]);

    const fetchPrivateMedia = useCallback(async (pageNumber: number) => {
        if (pageNumber > 1 && busyRef.current) { return; }
        busyRef.current = true;
        if (pageNumber > 1) { setLoadingMore(true); }
        try {
            const data = await getMedia({ page: pageNumber, isPrivate: true, privateToken });
            setMedia(prev => {
                if (pageNumber === 1) { return data.results; }
                const existing = new Set(prev.map(m => m.id));
                return [...prev, ...data.results.filter(m => !existing.has(m.id))];
            });
            pageRef.current = pageNumber;
            hasMoreRef.current = !!data.next;
        } catch (err) {
            console.error('Failed to fetch private gallery', err);
            Alert.alert('Error', 'Failed to fetch locked folder. Your session may have expired.');
            navigation.goBack();
        } finally {
            busyRef.current = false;
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [privateToken, navigation]);

    useEffect(() => {
        if (privateToken) {
            fetchPrivateMedia(1);
        }
    }, [fetchPrivateMedia, privateToken]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchPrivateMedia(1);
    }, [fetchPrivateMedia]);

    const onEndReached = useCallback(() => {
        if (hasMoreRef.current) {
            fetchPrivateMedia(pageRef.current + 1);
        }
    }, [fetchPrivateMedia]);

    const handlePressItem = useCallback((item: Media, index: number) => {
        if (selectionMode) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                if (next.size === 0) setSelectionMode(false);
                return next;
            });
            return;
        }
        if (index < 0) { return; }
        viewerOpenRef.current = true;
        setSelectedIndex(index);
        setViewerVisible(true);
    }, [selectionMode]);

    const handleLongPressItem = useCallback((item: Media) => {
        setSelectionMode(true);
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectionMode(false);
        setSelectedIds(new Set());
    }, []);

    const handleUnprivate = async () => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        try {
            await bulkUnprivate(ids);
            setMedia(prev => prev.filter(m => !selectedIds.has(m.id)));
            clearSelection();
        } catch (err) {
            Alert.alert('Error', 'Failed to remove items from Locked Folder.');
        }
    };

    const handleViewerClose = useCallback((lastIndex: number) => {
        viewerOpenRef.current = false;
        setViewerVisible(false);
        const last = media[lastIndex];
        setMedia(prev => prev.filter(m => m.is_private));
        if (last?.is_private) {
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
            {selectionMode ? (
                <View style={[styles.selectionHeader, { paddingTop: Math.max(insets.top, 16) }]}>
                    <TouchableOpacity onPress={clearSelection} style={styles.backBtn}>
                        <ArrowLeft size={24} color={colors.onSurface} />
                    </TouchableOpacity>
                    <Text style={styles.selectionCount}>{selectedIds.size}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={handleUnprivate} style={styles.unprivateBtn}>
                        <Unlock size={20} color={colors.primary} />
                        <Text style={styles.unprivateText}>Move out</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ArrowLeft size={24} color={colors.onSurface} />
                    </TouchableOpacity>
                    <Text style={styles.heading}>Locked Folder</Text>
                </View>
            )}

            <MediaGrid
                ref={gridRef}
                media={media}
                showFavoriteBadge={false}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onPressItem={handlePressItem}
                onLongPressItem={handleLongPressItem}
                loading={loading}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onEndReached={onEndReached}
                loadingMore={loadingMore}
                bottomPadding={insets.bottom + 100}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Lock size={64} color="#ccc" style={styles.emptyIcon} />
                        <Text style={styles.emptyTitle}>Nothing here yet</Text>
                        <Text style={styles.emptySubtitle}>Move items to Locked Folder to keep them hidden.</Text>
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
                privateToken={privateToken}
            />
        </View>
    );
};

export default PrivateGalleryScreen;

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.surface },
    backBtn: { marginRight: 16, padding: 4 },
    heading: { fontSize: 24, fontWeight: '500', color: '#1c1b1f' },
    selectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#e8f0fe' },
    selectionCount: { fontSize: 22, fontWeight: '500', color: colors.primary },
    unprivateBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 20 },
    unprivateText: { color: colors.primary, marginLeft: 8, fontWeight: '500' },
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
    emptySubtitle: { fontSize: 16, color: '#777', textAlign: 'center' },
});
