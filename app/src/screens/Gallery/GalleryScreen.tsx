import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    BackHandler,
    Keyboard,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    ToastAndroid,
    TouchableOpacity,
    View,
} from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import {
    CloudOff,
    Cloud,
    Download,
    FolderPlus,
    Heart,
    Image as ImageIcon,
    CalendarDays,
    Clock,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    X,
} from 'lucide-react-native';
import { bulkFavorite, bulkTrash, bulkUpdateTakenAt, downloadMediaToDevice, getMedia } from '../../api/media';
import { Media } from '../../types/media';
import { useAuth } from '../../context/AuthContext';
import { useUploadActions } from '../../context/UploadContext';
import { useLocalMedia } from '../../hooks/useLocalMedia';
import { mediaDate } from '../../utils/format';
import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from './MediaViewer';
import UploadPreviewModal from './UploadPreviewModal';
import SelectAlbumModal from '../Albums/SelectAlbumModal';
import CloudIndicator from '../../components/CloudIndicator';

type LoadState = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';
type SortOrdering = 'date' | 'added';

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
    const navigation = useNavigation<StackNavigationProp<any>>();
    const { logout, user } = useAuth();
    const { completedVersion } = useUploadActions();
    const insets = useSafeAreaInsets();
    const gridRef = useRef<MediaGridHandle>(null);

    const [media, setMedia] = useState<Media[]>([]);
    const { localMedia, fetchNextPage: fetchNextLocalPage, refresh: refreshLocalMedia } = useLocalMedia();

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
    const [ordering, setOrdering] = useState<SortOrdering>('date');
    const [bulkDatePickerVisible, setBulkDatePickerVisible] = useState(false);

    const combinedMedia = React.useMemo(() => {
        if (ordering !== 'date') return media; // Only mix local in date sorting
        
        const byFilenameSize = new Map<string, Media>();
        media.forEach(m => byFilenameSize.set(`${m.filename}_${m.file_size}`, m));
        
        const merged = [...media];
        for (const local of localMedia) {
            // Very simple deduplication:
            const key = `${local.filename}_${local.file_size}`;
            if (byFilenameSize.has(key)) {
                // Already backed up, maybe mark the cloud item as also local?
                const cloudItem = byFilenameSize.get(key)!;
                cloudItem._backupStatus = 'backed_up';
            } else {
                // Not backed up
                local._backupStatus = 'not_backed_up';
                merged.push(local);
            }
        }
        
        // Sort newest first
        return merged.sort((a, b) => mediaDate(b).getTime() - mediaDate(a).getTime());
    }, [media, localMedia, ordering]);

    const selectionAnim = useRef(new Animated.Value(0)).current;

    // Refs so callbacks stay stable and async responses can be discarded when stale.
    const isMounted = useRef(true);
    const requestId = useRef(0);
    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);
    const searchRef = useRef('');
    const orderingRef = useRef<SortOrdering>('date');
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
                ordering: orderingRef.current === 'added' ? 'added' : undefined,
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
        const timeout = setTimeout(() => {
            fetchPage(1, 'initial');
            fetchNextLocalPage(true);
        }, delay);
        return () => clearTimeout(timeout);
    }, [searchQuery, fetchPage, fetchNextLocalPage]);

    // Re-fetch from scratch when ordering changes.
    useEffect(() => {
        orderingRef.current = ordering;
        pageRef.current = 0;
        hasMoreRef.current = true;
        setMedia([]);
        fetchPage(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordering]);

    // New uploads finished: merge them in without resetting the scroll position.
    useEffect(() => {
        if (completedVersion > 0) {
            fetchPage(1, 'silent');
        }
    }, [completedVersion, fetchPage]);

    // Poll AutoBackup status to refresh media when background uploads complete
    const [lastBackupCount, setLastBackupCount] = useState<number | null>(null);
    useEffect(() => {
        import('../../services/AutoBackupService').then(({ isAutoBackupAvailable, getAutoBackupStatus }) => {
            if (!isAutoBackupAvailable) return;
            const timer = setInterval(async () => {
                const status = await getAutoBackupStatus();
                if (status) {
                    setLastBackupCount(prev => {
                        if (prev !== null && status.backedUpCount > prev) {
                            fetchPage(1, 'silent');
                        }
                        return status.backedUpCount;
                    });
                }
            }, 5000);
            return () => clearInterval(timer);
        });
    }, [fetchPage]);

    const onRefresh = useCallback(() => {
        fetchPage(1, 'refresh');
        refreshLocalMedia();
    }, [fetchPage, refreshLocalMedia]);

    const onEndReached = useCallback(() => {
        if (!busyRef.current && hasMoreRef.current) {
            fetchPage(pageRef.current + 1, 'more');
        }
        fetchNextLocalPage();
    }, [fetchPage, fetchNextLocalPage]);

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
        const item = combinedMedia[lastIndex];
        if (item) {
            requestAnimationFrame(() => gridRef.current?.scrollToMedia(item.id));
        }
    }, [combinedMedia]);

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

    const handleBulkDateChange = async (date: Date) => {
        setBulkDatePickerVisible(false);
        const ids = Array.from(selectedIds);
        try {
            await bulkUpdateTakenAt(ids, date);
            const updated = new Map(media.filter(m => ids.includes(m.id)).map(m => [m.id, { ...m, taken_at: date.toISOString() }]));
            setMedia(prev => prev.map(m => updated.get(m.id) || m));
            ToastAndroid.show(`Date updated for ${ids.length} items`, ToastAndroid.SHORT);
            clearSelection();
        } catch {
            Alert.alert('Error', 'Failed to update dates.');
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
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <CloudIndicator />
                            <TouchableOpacity style={styles.profileAvatar} onPress={() => navigation.navigate('Settings')}>
                                <Text style={styles.profileInitial}>{user?.first_name?.charAt(0).toUpperCase() || 'U'}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

    const renderHeader = () => {
        if (selectionMode) return null;
        return (
            <View style={styles.headerContainer}>
                <MemoriesCarousel />
                <View style={styles.filtersScroll}>
                    <View style={styles.pillFilters}>
                        <TouchableOpacity style={[styles.pillBtn, styles.pillBtnActive]}><Text style={styles.pillTextActive}>All</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.pillBtn}><Text style={styles.pillText}>Videos</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.pillBtn}><Text style={styles.pillText}>Screenshots</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.pillBtn}><Text style={styles.pillText}>Selfies</Text></TouchableOpacity>
                    </View>
                </View>
                <View style={styles.sortRow}>
                    <TouchableOpacity
                        style={[styles.sortPill, ordering === 'date' && styles.sortPillActive]}
                        onPress={() => setOrdering('date')}
                        activeOpacity={0.75}
                    >
                        <CalendarDays size={12} color={ordering === 'date' ? '#fff' : '#888'} />
                        <Text style={[styles.sortPillText, ordering === 'date' && styles.sortPillTextActive]}>Date taken</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.sortPill, ordering === 'added' && styles.sortPillActive]}
                        onPress={() => setOrdering('added')}
                        activeOpacity={0.75}
                    >
                        <Clock size={12} color={ordering === 'added' ? '#fff' : '#888'} />
                        <Text style={[styles.sortPillText, ordering === 'added' && styles.sortPillTextActive]}>Recently added</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };
            <MediaGrid
                ref={gridRef}
                media={combinedMedia}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onPressItem={handlePressItem}
                onLongPressItem={handleLongPressItem}
                onToggleGroup={toggleDateGroup}
                onScroll={Keyboard.dismiss}
                onEndReached={onEndReached}
                renderCellOverlay={(item) => {
                    if (!item._backupStatus) return null;
                    return (
                        <View style={styles.backupIconContainer}>
                            {item._backupStatus === 'backed_up' && <Cloud size={14} color="#fff" />}
                            {item._backupStatus === 'not_backed_up' && <CloudOff size={14} color="#fff" />}
                        </View>
                    );
                }}
                loading={loadState === 'loading'}
                refreshing={loadState === 'refreshing'}
                onRefresh={onRefresh}
                loadingMore={loadState === 'loadingMore'}
                ListEmptyComponent={emptyComponent}
                ListHeaderComponent={renderHeader()}
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
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setBulkDatePickerVisible(true)}>
                            <CalendarDays size={24} color="#444" />
                            <Text style={styles.actionText}>Date</Text>
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
                media={combinedMedia}
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

            {/* Bulk Date Picker */}
            <Modal visible={bulkDatePickerVisible} transparent animationType="fade" onRequestClose={() => setBulkDatePickerVisible(false)}>
                <BulkDatePickerModal
                    count={selectedIds.size}
                    onConfirm={handleBulkDateChange}
                    onCancel={() => setBulkDatePickerVisible(false)}
                />
            </Modal>
        </View>
    );
};

export default GalleryScreen;

const BulkDatePickerModal = ({ count, onConfirm, onCancel }: {
    count: number;
    onConfirm: (date: Date) => void;
    onCancel: () => void;
}) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const [year, setYear] = React.useState(String(now.getFullYear()));
    const [month, setMonth] = React.useState(pad(now.getMonth() + 1));
    const [day, setDay] = React.useState(pad(now.getDate()));
    const [hour, setHour] = React.useState(pad(now.getHours()));
    const [minute, setMinute] = React.useState(pad(now.getMinutes()));

    const handleConfirm = () => {
        const d = new Date(
            parseInt(year, 10),
            parseInt(month, 10) - 1,
            parseInt(day, 10),
            parseInt(hour, 10),
            parseInt(minute, 10),
        );
        if (isNaN(d.getTime())) {
            Alert.alert('Invalid date', 'Please enter a valid date and time.');
            return;
        }
        onConfirm(d);
    };

    return (
        <View style={bulkStyles.overlay}>
            <View style={bulkStyles.sheet}>
                <Text style={bulkStyles.title}>Set Date for {count} item{count > 1 ? 's' : ''}</Text>
                <Text style={bulkStyles.subtitle}>All selected items will have the same date taken.</Text>
                <View style={bulkStyles.row}>
                    {[['Year', year, setYear, 4], ['Month', month, setMonth, 2], ['Day', day, setDay, 2], ['Hour', hour, setHour, 2], ['Min', minute, setMinute, 2]].map(([lbl, val, setter, max], i) => (
                        <React.Fragment key={i}>
                            {i === 3 && <Text style={bulkStyles.sep}>  </Text>}
                            {i > 0 && i < 3 && <Text style={bulkStyles.sep}>/</Text>}
                            {i === 4 && <Text style={bulkStyles.sep}>:</Text>}
                            <View style={bulkStyles.field}>
                                <Text style={bulkStyles.label}>{lbl as string}</Text>
                                <TextInput style={bulkStyles.input} value={val as string}
                                    onChangeText={setter as any} keyboardType="number-pad" maxLength={max as number} />
                            </View>
                        </React.Fragment>
                    ))}
                </View>
                <View style={bulkStyles.actions}>
                    <Pressable style={bulkStyles.cancelBtn} onPress={onCancel}>
                        <Text style={bulkStyles.cancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={bulkStyles.confirmBtn} onPress={handleConfirm}>
                        <Text style={bulkStyles.confirmText}>Apply to All</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

const bulkStyles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    title: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 6, textAlign: 'center' },
    subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 20 },
    row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 24, gap: 4 },
    field: { alignItems: 'center' },
    label: { fontSize: 11, color: '#888', marginBottom: 4 },
    input: { backgroundColor: '#f1f3f4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 18, fontWeight: '600', minWidth: 52, textAlign: 'center', color: '#111' },
    sep: { fontSize: 18, fontWeight: '600', color: '#888', marginBottom: 10, paddingHorizontal: 2 },
    actions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f3f4', alignItems: 'center' },
    cancelText: { color: '#333', fontSize: 16, fontWeight: '600' },
    confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1a73e8', alignItems: 'center' },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

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
    searchBarFocused: {
        flex: 1,
        marginLeft: 0,
    },
    backupIconContainer: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
        padding: 4,
    },
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

    headerContainer: {
        backgroundColor: '#fff',
        paddingBottom: 8,
    },
    filtersScroll: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    pillFilters: {
        flexDirection: 'row',
        gap: 8,
    },
    pillBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f1f3f4',
    },
    pillBtnActive: {
        backgroundColor: '#1a73e8',
    },
    pillText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#3c4043',
    },
    pillTextActive: {
        fontSize: 14,
        fontWeight: '500',
        color: '#fff',
    },
    sortRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 6,
        paddingTop: 2,
    },
    sortPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#d0d0d0',
        backgroundColor: 'transparent',
    },
    sortPillActive: {
        backgroundColor: '#1a73e8',
        borderColor: '#1a73e8',
    },
    sortPillText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#888',
    },
    sortPillTextActive: {
        color: '#fff',
    },
});

