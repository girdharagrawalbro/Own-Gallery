import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Pressable,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ToastAndroid,
} from 'react-native';
import { launchImageLibrary, Asset } from 'react-native-image-picker';

import { useNavigation } from '@react-navigation/native';
import { ImageOff, Heart, Check, Image as ImageIcon, Trash2, X, Plus, Info, Download } from 'lucide-react-native';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import MediaViewer from './MediaViewer';
import SkeletonGrid from '../../components/SkeletonGrid';
import VideoThumbnail from '../../components/VideoThumbnail';
import { prefetchThumbnails } from '../../utils/prefetch';
import { getMedia, uploadMedia, bulkTrash, bulkFavorite, downloadMediaToDevice } from '../../api/media';
import { Media } from '../../types/media';
import { useAuth } from '../../context/AuthContext';
import UploadPreviewModal from './UploadPreviewModal';

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

type LoadState = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';

type ListItem =
    | { type: 'header'; title: string; id: string; mediaIds: number[] }
    | { type: 'row'; items: Media[]; id: string };

const GalleryScreen = () => {
    const { logout, user } = useAuth();
    const navigation = useNavigation();

    const [media, setMedia] = useState<Media[]>([]);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const [previewVisible, setPreviewVisible] = useState(false);
    const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

    // Filter/Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');

    // Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const fetchMedia = useCallback(async (
        pageNumber: number,
        mode: 'initial' | 'refresh' | 'more',
    ) => {
        if (mode === 'initial') { setLoadState('loading'); }
        else if (mode === 'refresh') { setLoadState('refreshing'); }
        else { setLoadState('loadingMore'); }

        setError(null);

        try {
            const filterType = mediaFilter === 'all' ? undefined : mediaFilter;
            const search = searchQuery.trim() || undefined;
            const response = await getMedia(pageNumber, false, search, filterType);

            if (!isMounted.current) { return; }

            if (mode === 'more') {
                setMedia(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const newItems = response.results.filter((m: Media) => !existingIds.has(m.id));
                    prefetchThumbnails(newItems);
                    return [...prev, ...newItems];
                });
            } else {
                prefetchThumbnails(response.results);
                setMedia(response.results);
            }

            setPage(pageNumber);
            setHasMore(!!response.next);
            setLoadState('idle');
        } catch (err: any) {
            if (!isMounted.current) { return; }

            if (err?.response?.status === 401) {
                logout();
                return;
            }

            setError(err?.response?.data?.detail || err?.message || 'Failed to load media.');
            setLoadState('error');
        }
    }, [logout, searchQuery, mediaFilter]);

    useEffect(() => {
        // Debounce search slightly
        const timeout = setTimeout(() => {
            fetchMedia(1, 'loading');
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery, mediaFilter]);

    const onRefresh = useCallback(() => {
        fetchMedia(1, 'refreshing');
    }, [searchQuery, mediaFilter]);

    const onEndReached = useCallback(() => {
        if (loadState === 'idle' && hasMore) {
            fetchMedia(page + 1, 'loadingMore');
        }
    }, [loadState, hasMore, page, searchQuery, mediaFilter]);

    const handleUpload = async () => {
        const result = await launchImageLibrary({
            mediaType: 'mixed',
            selectionLimit: 0,
            includeExtra: true,
        });

        if (result.assets && result.assets.length > 0) {
            setSelectedAssets(result.assets);
            setPreviewVisible(true);
        }
    };

    const toggleSelectionMode = useCallback((item: Media) => {
        setSelectionMode(true);
        setSelectedIds(new Set([item.id]));
    }, []);

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            if (next.size === 0) setSelectionMode(false);
            return next;
        });
    }, []);

    const toggleDateGroup = useCallback((mediaIds: number[]) => {
        if (!selectionMode) setSelectionMode(true);
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = mediaIds.length > 0 && mediaIds.every(id => next.has(id));
            if (allSelected) {
                mediaIds.forEach(id => next.delete(id));
            } else {
                mediaIds.forEach(id => next.add(id));
            }
            if (next.size === 0) setSelectionMode(false);
            return next;
        });
    }, [selectionMode]);

    const openViewer = useCallback((mediaItem: Media) => {
        const index = media.findIndex(m => m.id === mediaItem.id);
        if (index !== -1) {
            setSelectedIndex(index);
            setViewerVisible(true);
        }
    }, [media]);

    const handleMediaPress = useCallback((item: Media) => {
        if (selectionMode) {
            toggleSelection(item.id);
        } else {
            openViewer(item);
        }
    }, [selectionMode, toggleSelection, openViewer]);

    const handleMediaLongPress = useCallback((item: Media) => {
        if (!selectionMode) {
            toggleSelectionMode(item);
        }
    }, [selectionMode, toggleSelectionMode]);

    // Group media by date
    const listData = React.useMemo(() => {
        const groups: { [date: string]: Media[] } = {};
        media.forEach(m => {
            const dateStr = new Date(m.taken_at || m.created_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(m);
        });

        const result: ListItem[] = [];
        for (const [dateStr, items] of Object.entries(groups)) {
            result.push({ type: 'header', title: dateStr, id: `header-${dateStr}`, mediaIds: items.map(m => m.id) });
            // Chunk into rows of 3
            for (let i = 0; i < items.length; i += 3) {
                const chunk = items.slice(i, i + 3);
                result.push({ type: 'row', items: chunk, id: `row-${chunk[0].id}` });
            }
        }
        return result;
    }, [media]);

    const renderItem = useCallback(({ item }: { item: ListItem }) => {
        if (item.type === 'header') {
            const isAllSelected = item.mediaIds.every(id => selectedIds.has(id));
            return (
                <View style={styles.dateHeaderContainer}>
                    <Text style={styles.dateHeaderText}>{item.title}</Text>
                    {selectionMode && (
                        <TouchableOpacity onPress={() => toggleDateGroup(item.mediaIds)} style={styles.dateGroupSelectBtn}>
                            <View style={[styles.dateGroupCheckBadge, isAllSelected && styles.dateGroupCheckBadgeActive]}>
                                {isAllSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            );
        }

        return (
            <View style={styles.row}>
                {item.items.map(mediaItem => {
                    const isSelected = selectedIds.has(mediaItem.id);
                    return (
                        <Pressable
                            key={mediaItem.id}
                            style={styles.cell}
                            onPress={() => handleMediaPress(mediaItem)}
                            onLongPress={() => handleMediaLongPress(mediaItem)}
                        >
                            {mediaItem.media_type === 'video' ? (
                                <VideoThumbnail thumbnailUrl={mediaItem.thumbnail_url} duration={mediaItem.duration} />
                            ) : mediaItem.thumbnail_url ? (
                                <AuthenticatedImage uri={mediaItem.thumbnail_url} style={styles.cellImage} resizeMode="cover" />
                            ) : (
                                <View style={styles.noThumb}><ImageOff size={24} color="#ccc" /></View>
                            )}

                            {mediaItem.is_favorite && !selectionMode && (
                                <View style={styles.favoriteBadge}>
                                    <Heart size={12} color="red" fill="red" />
                                </View>
                            )}

                            {mediaItem.status === 'processing' && (
                                <View style={styles.processingOverlay}>
                                    <ActivityIndicator size="small" color="#fff" />
                                </View>
                            )}

                            {selectionMode && (
                                <View style={styles.selectionOverlay}>
                                    {isSelected && (
                                        <View style={styles.checkBadge}>
                                            <Check size={14} color="#fff" strokeWidth={3} />
                                        </View>
                                    )}
                                </View>
                            )}
                        </Pressable>
                    );
                })}
                {/* Pad empty cells in row */}
                {Array.from({ length: 3 - item.items.length }).map((_, i) => (
                    <View key={`empty-${i}`} style={[styles.cell, { backgroundColor: 'transparent' }]} />
                ))}
            </View>
        );
    }, [handleMediaPress, handleMediaLongPress, selectionMode, selectedIds, toggleDateGroup]);

    const handleBulkTrash = () => {
        Alert.alert('Move to Trash', `Move ${selectedIds.size} items to trash?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Trash', style: 'destructive', onPress: async () => {
                    try {
                        await bulkTrash(Array.from(selectedIds));
                        ToastAndroid.show(`${selectedIds.size} items moved to trash`, ToastAndroid.SHORT);
                        setMedia(prev => prev.filter(m => !selectedIds.has(m.id)));
                        setSelectionMode(false);
                        setSelectedIds(new Set());
                    } catch (err) {
                        Alert.alert('Error', 'Failed to trash items.');
                    }
                }
            }
        ]);
    };

    const handleBulkFavorite = async () => {
        try {
            await bulkFavorite(Array.from(selectedIds), true);
            ToastAndroid.show(`${selectedIds.size} items added to favorites`, ToastAndroid.SHORT);
            setMedia(prev => prev.map(m => selectedIds.has(m.id) ? { ...m, is_favorite: true } : m));
            setSelectionMode(false);
            setSelectedIds(new Set());
        } catch (err) {
            Alert.alert('Error', 'Failed to favorite items.');
        }
    };

    const handleBulkDownload = async () => {
        ToastAndroid.show(`Downloading ${selectedIds.size} items...`, ToastAndroid.SHORT);
        try {
            const selectedMedia = media.filter(m => selectedIds.has(m.id));
            for (const item of selectedMedia) {
                await downloadMediaToDevice(item.id, item.filename, true);
            }
            ToastAndroid.show(`Successfully saved ${selectedIds.size} items to device gallery!`, ToastAndroid.SHORT);
            setSelectionMode(false);
            setSelectedIds(new Set());
        } catch (err) {
            Alert.alert('Error', 'Failed to save one or more items to device.');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.heading}>Welcome, {user?.first_name || 'User'}</Text>
            </View>

            <View style={styles.filters}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#888"
                />
                <View style={styles.filterChips}>
                    {(['all', 'image', 'video'] as const).map(type => (
                        <TouchableOpacity
                            key={type}
                            style={[styles.chip, mediaFilter === type && styles.chipActive]}
                            onPress={() => setMediaFilter(type)}
                        >
                            <Text style={[styles.chipText, mediaFilter === type && styles.chipTextActive]}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {loadState === 'loading' ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            ) : (
                <FlatList
                    data={listData}
                    extraData={selectedIds}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={loadState === 'refreshing'} onRefresh={onRefresh} />}
                    onEndReached={onEndReached}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                        loadState === 'loadingMore' ? (
                            <ActivityIndicator style={styles.footerSpinner} color="#555" />
                        ) : null
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <ImageIcon size={64} color="#ccc" style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyTitle}>Gallery is empty</Text>
                            <Text style={styles.emptySubtitle}>Tap the + button to upload photos and videos</Text>
                        </View>
                    }
                />
            )}

            {!selectionMode && (
                <TouchableOpacity style={styles.fab} onPress={handleUpload}>
                    <Plus size={32} color="#fff" />
                </TouchableOpacity>
            )}

            {selectionMode && (
                <View style={styles.bottomBar}>
                    <Text style={styles.selectionCount}>{selectedIds.size} Selected</Text>
                    <View style={styles.bottomBarActions}>
                        <TouchableOpacity onPress={handleBulkTrash}>
                            <Trash2 size={24} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleBulkFavorite()}>
                            <Heart size={24} color="red" fill="red" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleBulkDownload}>
                            <Download size={24} color="#007AFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelectionMode(false)}>
                            <X size={24} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={() => setViewerVisible(false)}
                onMediaUpdated={(updated) => setMedia(prev => prev.map(m => m.id === updated.id ? updated : m))}
                onMediaDeleted={(deletedId) => setMedia(prev => prev.filter(m => m.id !== deletedId))}
            />
            <UploadPreviewModal
                visible={previewVisible}
                assets={selectedAssets}
                onClose={() => setPreviewVisible(false)}
                onUploadComplete={() => {
                    onRefresh();
                }}
            />
        </SafeAreaView>
    );
};

export default GalleryScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    heading: { fontSize: 22, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
    filters: { paddingHorizontal: 16, paddingBottom: 8 },
    searchInput: { backgroundColor: '#f0f0f0', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8 },
    filterChips: { flexDirection: 'row', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0' },
    chipActive: { backgroundColor: '#007AFF' },
    chipText: { fontSize: 14, color: '#333' },
    chipTextActive: { color: '#fff', fontWeight: 'bold' },

    dateHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
    dateHeaderText: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    dateGroupSelectBtn: { padding: 4 },
    dateGroupCheckBadge: { width: 20, height: 20, borderRadius: 12, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
    dateGroupCheckBadgeActive: { backgroundColor: '#007AFF', borderColor: '#007AFF', borderWidth: 0 },

    row: { flexDirection: 'row', width: '100%' },
    cell: { position: 'relative', width: CELL, height: CELL, margin: 0.5, backgroundColor: '#eee', overflow: 'hidden' },
    cellImage: { width: '100%', height: '100%' },
    noThumb: { flex: 1, backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
    noThumbIcon: { fontSize: 24 }, // Keeping just in case
    favoriteBadge: { position: 'absolute', bottom: 4, right: 4, padding: 2 },
    heartIcon: { fontSize: 12 }, // Keeping just in case

    selectionOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 4 },
    processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    checkBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end', borderWidth: 2, borderColor: '#fff' },

    footerSpinner: { paddingVertical: 24 },
    retrySmallText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
    fab: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
    fabText: { color: '#fff', fontSize: 22, fontWeight: '400', marginTop: -2 },

    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 5
    },
    selectionCount: { fontSize: 16, fontWeight: '600', color: '#333' },
    bottomBarActions: { flexDirection: 'row', gap: 24 },
});
