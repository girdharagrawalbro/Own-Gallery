import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    BackHandler,
    Keyboard,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    ToastAndroid,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import {
    Download,
    FolderPlus,
    Heart,
    Image as ImageIcon,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    X,
} from 'lucide-react-native';

import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from './MediaViewer';
import UploadPreviewModal from './UploadPreviewModal';
import SelectAlbumModal from '../Albums/SelectAlbumModal';
import { bulkFavorite, bulkTrash, downloadMediaToDevice, getMedia } from '../../api/media';
import { Media } from '../../types/media';
import { useAuth } from '../../context/AuthContext';
import { useUploadActions } from '../../context/UploadContext';
import { mediaDate } from '../../utils/format';

type LoadState = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';

const EMPTY_SELECTION = new Set<number>();

/** Merge a fresh first page into the loaded list (keeps later pages), newest first. */
const mergeMedia = (prev: Media[], fresh: Media[]): Media[] => {
    const byId = new Map<number, Media>();
    prev.forEach(m => byId.set(m.id, m));
    fresh.forEach(m => byId.set(m.id, m));
    return Array.from(byId.values()).sort(
        (a, b) => mediaDate(b).getTime() - mediaDate(a).getTime(),
    );
};

const GalleryScreen = () => {
    const { logout, user } = useAuth();
    const { completedVersion } = useUploadActions();
    const insets = useSafeAreaInsets();
    const gridRef = useRef<MediaGridHandle>(null);

    const [media, setMedia] = useState<Media[]>([]);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const [previewVisible, setPreviewVisible] = useState(false);
    const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(EMPTY_SELECTION);
    const selectionMode = selectedIds.size > 0;
    const [selectAlbumVisible, setSelectAlbumVisible] = useState(false);

    const selectionAnim = useRef(new Animated.Value(0)).current;

    // Refs so callbacks stay stable and async responses can be discarded when stale.
    const isMounted = useRef(true);
    const requestId = useRef(0);
    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);
    const searchRef = useRef('');
    const logoutRef = useRef(logout);
    logoutRef.current = logout;

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        Animated.timing(selectionAnim, {
            toValue: selectionMode ? 1 : 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [selectionMode, selectionAnim]);

    const clearSelection = useCallback(() => setSelectedIds(EMPTY_SELECTION), []);

    // Hardware back exits selection mode first.
    useEffect(() => {
        if (!selectionMode) { return; }
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            clearSelection();
            return true;
        });
        return () => sub.remove();
    }, [selectionMode, clearSelection]);

    const fetchPage = useCallback(async (
        pageNumber: number,
        mode: 'initial' | 'refresh' | 'more' | 'silent',
    ) => {
        const id = ++requestId.current;
        busyRef.current = true;
        if (mode === 'initial') { setLoadState('loading'); }
        else if (mode === 'refresh') { setLoadState('refreshing'); }
        else if (mode === 'more') { setLoadState('loadingMore'); }
        setError(null);

        try {
            const response = await getMedia({
                page: pageNumber,
                search: searchRef.current.trim() || undefined,
            });
            if (!isMounted.current || id !== requestId.current) { return; }

            if (mode === 'more') {
                setMedia(prev => {
                    const existing = new Set(prev.map(m => m.id));
                    return [...prev, ...response.results.filter(m => !existing.has(m.id))];
                });
                pageRef.current = pageNumber;
                hasMoreRef.current = !!response.next;
            } else if (mode === 'silent') {
                setMedia(prev => mergeMedia(prev, response.results));
                if (pageRef.current <= 1) {
                    hasMoreRef.current = !!response.next;
                }
            } else {
                setMedia(response.results);
                pageRef.current = pageNumber;
                hasMoreRef.current = !!response.next;
            }
            setLoadState('idle');
        } catch (err: any) {
            if (!isMounted.current || id !== requestId.current) { return; }
            if (err?.response?.status === 401) {
                logoutRef.current();
                return;
            }
            setError(err?.response?.data?.detail || err?.message || 'Failed to load media.');
            setLoadState(mode === 'silent' ? 'idle' : 'error');
        } finally {
            if (id === requestId.current) {
                busyRef.current = false;
            }
        }
    }, []);

    // Initial load + debounced search.
    const firstLoad = useRef(true);
    useEffect(() => {
        searchRef.current = searchQuery;
        const delay = firstLoad.current ? 0 : 350;
        firstLoad.current = false;
        const timeout = setTimeout(() => fetchPage(1, 'initial'), delay);
        return () => clearTimeout(timeout);
    }, [searchQuery, fetchPage]);

    // New uploads finished: merge them in without resetting the scroll position.
    useEffect(() => {
        if (completedVersion > 0) {
            fetchPage(1, 'silent');
        }
    }, [completedVersion, fetchPage]);

    const onRefresh = useCallback(() => {
        fetchPage(1, 'refresh');
    }, [fetchPage]);

    const onEndReached = useCallback(() => {
        if (!busyRef.current && hasMoreRef.current) {
            fetchPage(pageRef.current + 1, 'more');
        }
    }, [fetchPage]);

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

    // ── Selection ───────────────────────────────────────────────────────────

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    }, []);

    const toggleDateGroup = useCallback((ids: number[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = ids.length > 0 && ids.every(id => next.has(id));
            if (allSelected) {
                ids.forEach(id => next.delete(id));
            } else {
                ids.forEach(id => next.add(id));
            }
            return next;
        });
    }, []);

    const handlePressItem = useCallback((item: Media, index: number) => {
        if (selectionMode) {
            toggleSelection(item.id);
        } else if (index >= 0) {
            Keyboard.dismiss();
            setSelectedIndex(index);
            setViewerVisible(true);
        }
    }, [selectionMode, toggleSelection]);

    const handleLongPressItem = useCallback((item: Media) => {
        toggleSelection(item.id);
    }, [toggleSelection]);

    // ── Viewer callbacks ────────────────────────────────────────────────────

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

    // ── Bulk actions ────────────────────────────────────────────────────────

    const handleBulkTrash = () => {
        const ids = Array.from(selectedIds);
        Alert.alert('Move to Trash', `Move ${ids.length} items to trash?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Trash', style: 'destructive', onPress: async () => {
                    try {
                        await bulkTrash(ids);
                        ToastAndroid.show(`${ids.length} items moved to trash`, ToastAndroid.SHORT);
                        const removed = new Set(ids);
                        setMedia(prev => prev.filter(m => !removed.has(m.id)));
                        clearSelection();
                    } catch {
                        Alert.alert('Error', 'Failed to trash items.');
                    }
                },
            },
        ]);
    };

    const handleBulkFavorite = async () => {
        const ids = Array.from(selectedIds);
        try {
            await bulkFavorite(ids, true);
            ToastAndroid.show(`${ids.length} items added to favorites`, ToastAndroid.SHORT);
            const favored = new Set(ids);
            setMedia(prev => prev.map(m => (favored.has(m.id) ? { ...m, is_favorite: true } : m)));
            clearSelection();
        } catch {
            Alert.alert('Error', 'Failed to favorite items.');
        }
    };

    const handleBulkDownload = async () => {
        const items = media.filter(m => selectedIds.has(m.id));
        clearSelection();
        ToastAndroid.show(`Downloading ${items.length} items...`, ToastAndroid.SHORT);
        let failed = 0;
        for (const item of items) {
            try {
                await downloadMediaToDevice(item, true);
            } catch {
                failed += 1;
            }
        }
        if (failed > 0) {
            Alert.alert('Error', `Failed to save ${failed} of ${items.length} items to device.`);
        } else {
            ToastAndroid.show(`Saved ${items.length} items to device gallery!`, ToastAndroid.SHORT);
        }
    };

    const selectedIdList = React.useMemo(() => Array.from(selectedIds), [selectedIds]);

    const emptyComponent = loadState === 'error' ? (
        <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Couldn't load your photos</Text>
            {!!error && <Text style={styles.emptySubtitle}>{error}</Text>}
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchPage(1, 'initial')}>
                <RefreshCw size={16} color="#fff" />
                <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
        </View>
    ) : (
        <View style={styles.emptyState}>
            <ImageIcon size={64} color="#ccc" style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>
                {searchQuery.trim() ? 'No results' : 'No photos yet'}
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Search pill */}
            <View style={[styles.searchContainer, { paddingTop: Math.max(insets.top, 16) }]}>
                <View style={styles.searchPill}>
                    <Search size={20} color="#777" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search your photos"
                        placeholderTextColor="#777"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                        onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    {searchQuery.length > 0 ? (
                        <Pressable onPress={() => setSearchQuery('')} hitSlop={10} style={styles.clearSearch}>
                            <X size={18} color="#5f6368" />
                        </Pressable>
                    ) : (
                        <View style={styles.profileAvatar}>
                            <Text style={styles.profileInitial}>{user?.first_name?.charAt(0).toUpperCase() || 'U'}</Text>
                        </View>
                    )}
                </View>
            </View>

            <MediaGrid
                ref={gridRef}
                media={media}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onPressItem={handlePressItem}
                onLongPressItem={handleLongPressItem}
                onToggleGroup={toggleDateGroup}
                loading={loadState === 'loading'}
                refreshing={loadState === 'refreshing'}
                onRefresh={onRefresh}
                onEndReached={onEndReached}
                loadingMore={loadState === 'loadingMore'}
                ListEmptyComponent={emptyComponent}
                bottomPadding={selectionMode ? 180 : 100}
            />

            {!selectionMode && (
                <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom + 16, 16) }]} onPress={handleUpload}>
                    <Plus size={28} color="#fff" />
                </TouchableOpacity>
            )}

            {/* Selection action bar */}
            <Animated.View
                pointerEvents={selectionMode ? 'auto' : 'none'}
                style={[
                    styles.bottomBar,
                    {
                        paddingBottom: Math.max(insets.bottom, 16),
                        opacity: selectionAnim,
                        transform: [{
                            translateY: selectionAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [150, 0],
                            }),
                        }],
                    },
                ]}
            >
                <View style={styles.bottomBarContent}>
                    <View style={styles.selectionTitleRow}>
                        <TouchableOpacity onPress={clearSelection} style={styles.closeSelectBtn}>
                            <X size={24} color="#444" />
                        </TouchableOpacity>
                        <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
                    </View>
                    <View style={styles.bottomBarActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectAlbumVisible(true)}>
                            <FolderPlus size={24} color="#444" />
                            <Text style={styles.actionText}>Add</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleBulkFavorite}>
                            <Heart size={24} color="#444" />
                            <Text style={styles.actionText}>Favorite</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleBulkDownload}>
                            <Download size={24} color="#444" />
                            <Text style={styles.actionText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleBulkTrash}>
                            <Trash2 size={24} color="#444" />
                            <Text style={styles.actionText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Animated.View>

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={handleViewerClose}
                onMediaUpdated={handleMediaUpdated}
                onMediaDeleted={handleMediaDeleted}
            />

            <UploadPreviewModal
                visible={previewVisible}
                assets={selectedAssets}
                onClose={() => setPreviewVisible(false)}
                onUploadComplete={() => {}}
            />

            <SelectAlbumModal
                visible={selectAlbumVisible}
                mediaIds={selectedIdList}
                onClose={() => setSelectAlbumVisible(false)}
                onAdded={clearSelection}
            />
        </View>
    );
};

export default GalleryScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: '#fff',
    },
    searchPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f3f4',
        borderRadius: 24,
        paddingHorizontal: 16,
        height: 48,
    },
    searchIcon: { marginRight: 12 },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#222',
        paddingVertical: 0,
    },
    clearSearch: { padding: 4, marginLeft: 8 },
    profileAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#1a73e8',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    profileInitial: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '500', color: '#3c4043', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#5f6368', textAlign: 'center', marginBottom: 16 },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#1a73e8',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    retryText: { color: '#fff', fontWeight: '600' },

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

    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        elevation: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    bottomBarContent: { paddingTop: 16, paddingHorizontal: 16 },
    selectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    closeSelectBtn: { marginRight: 16 },
    selectionCount: { fontSize: 18, fontWeight: '500', color: '#222' },
    bottomBarActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingBottom: 8,
    },
    actionBtn: { alignItems: 'center', justifyContent: 'center' },
    actionText: { fontSize: 12, fontWeight: '500', color: '#444', marginTop: 6 },
});
