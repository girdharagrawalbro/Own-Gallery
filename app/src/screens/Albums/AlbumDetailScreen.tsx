import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    BackHandler,
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    ToastAndroid,
    TouchableOpacity,
    View,
    StatusBar,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft,
    CalendarDays,
    Camera,
    FolderMinus,
    Heart,
    Image as ImageIcon,
    Plus,
    X,
} from 'lucide-react-native';
import { launchImageLibrary, Asset } from 'react-native-image-picker';

import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from '../Gallery/MediaViewer';
import AddMediaModal from './AddMediaModal';
import UploadPreviewModal from '../Gallery/UploadPreviewModal';
import SelectAlbumModal from './SelectAlbumModal';
import RemoteImage from '../../components/RemoteImage';
import { getAlbumMedia, removeMediaFromAlbum, setAlbumCover } from '../../api/albums';
import { bulkFavorite, bulkUpdateTakenAt } from '../../api/media';
import { Media } from '../../types/media';
import { useUploadActions } from '../../context/UploadContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 300;
const COMPACT_HEADER_HEIGHT = 56;
const EMPTY_SELECTION = new Set<number>();

const AlbumDetailScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { albumId, albumName: initialAlbumName } = route.params;
    const { completedVersion } = useUploadActions();
    const gridRef = useRef<MediaGridHandle>(null);

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [coverUrl, setCoverUrl] = useState<string | null>(route.params?.coverUrl || null);
    const [albumName] = useState(initialAlbumName);

    // ── Selection state ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<number>>(EMPTY_SELECTION);
    const selectionMode = selectedIds.size > 0;
    const [selectAlbumVisible, setSelectAlbumVisible] = useState(false);
    const [bulkDatePickerVisible, setBulkDatePickerVisible] = useState(false);

    const selectionAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(selectionAnim, {
            toValue: selectionMode ? 1 : 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [selectionMode, selectionAnim]);

    // Hardware back exits selection first
    useEffect(() => {
        if (!selectionMode) { return; }
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            setSelectedIds(EMPTY_SELECTION);
            return true;
        });
        return () => sub.remove();
    }, [selectionMode]);

    const clearSelection = useCallback(() => setSelectedIds(EMPTY_SELECTION), []);

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
            if (allSelected) { ids.forEach(id => next.delete(id)); }
            else { ids.forEach(id => next.add(id)); }
            return next;
        });
    }, []);

    // ── Viewer state ───────────────────────────────────────────────────────
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploadAssets, setUploadAssets] = useState<Asset[]>([]);

    const scrollY = useRef(new Animated.Value(0)).current;

    // Hero / compact header animations
    const heroOpacity = scrollY.interpolate({
        inputRange: [0, HERO_HEIGHT - COMPACT_HEADER_HEIGHT - insets.top],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });
    const compactHeaderOpacity = scrollY.interpolate({
        inputRange: [
            HERO_HEIGHT - COMPACT_HEADER_HEIGHT - insets.top - 40,
            HERO_HEIGHT - COMPACT_HEADER_HEIGHT - insets.top,
        ],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    // ── Data ───────────────────────────────────────────────────────────────
    const fetchMedia = useCallback(async () => {
        try {
            const data = await getAlbumMedia(albumId);
            setMedia(data.media);
            if (data.album?.cover_url) {
                setCoverUrl(data.album.cover_url);
            } else if (data.media.length > 0 && !coverUrl) {
                setCoverUrl(data.media[0].thumbnail_url || data.media[0].preview_url || null);
            }
        } catch (err) {
            console.error('Failed to fetch album media', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [albumId]);

    useEffect(() => { fetchMedia(); }, [fetchMedia]);
    useEffect(() => { if (completedVersion > 0) { fetchMedia(); } }, [completedVersion, fetchMedia]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchMedia(); }, [fetchMedia]);

    // ── Item press ─────────────────────────────────────────────────────────
    const handlePressItem = useCallback((item: Media, index: number) => {
        if (selectionMode) {
            toggleSelection(item.id);
        } else if (index >= 0) {
            setSelectedIndex(index);
            setViewerVisible(true);
        }
    }, [selectionMode, toggleSelection]);

    const handleLongPress = useCallback((item: Media) => {
        if (selectionMode) {
            toggleSelection(item.id);
            return;
        }
        // First long-press starts selection mode
        toggleSelection(item.id);
    }, [selectionMode, toggleSelection]);

    // ── Viewer callbacks ───────────────────────────────────────────────────
    const handleViewerClose = useCallback((lastIndex: number) => {
        setViewerVisible(false);
        const item = media[lastIndex];
        if (item) { requestAnimationFrame(() => gridRef.current?.scrollToMedia(item.id)); }
    }, [media]);

    const handleMediaUpdated = useCallback((updated: Media) => {
        setMedia(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    }, []);

    const handleMediaDeleted = useCallback((deletedId: number) => {
        setMedia(prev => prev.filter(m => m.id !== deletedId));
    }, []);

    // ── Bulk actions ───────────────────────────────────────────────────────
    const handleBulkRemove = () => {
        const ids = Array.from(selectedIds);
        Alert.alert('Remove from Album', `Remove ${ids.length} item${ids.length > 1 ? 's' : ''} from this album?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await removeMediaFromAlbum(albumId, ids);
                        const removed = new Set(ids);
                        setMedia(prev => prev.filter(m => !removed.has(m.id)));
                        ToastAndroid.show(`${ids.length} items removed`, ToastAndroid.SHORT);
                        clearSelection();
                    } catch {
                        Alert.alert('Error', 'Failed to remove items.');
                    }
                },
            },
        ]);
    };

    const handleBulkFavorite = async () => {
        const ids = Array.from(selectedIds);
        try {
            await bulkFavorite(ids, true);
            const favored = new Set(ids);
            setMedia(prev => prev.map(m => (favored.has(m.id) ? { ...m, is_favorite: true } : m)));
            ToastAndroid.show(`${ids.length} items added to favorites`, ToastAndroid.SHORT);
            clearSelection();
        } catch {
            Alert.alert('Error', 'Failed to favorite items.');
        }
    };

    const handleBulkDateChange = async (date: Date) => {
        setBulkDatePickerVisible(false);
        const ids = Array.from(selectedIds);
        try {
            await bulkUpdateTakenAt(ids, date);
            const iso = date.toISOString();
            setMedia(prev => prev.map(m => ids.includes(m.id) ? { ...m, taken_at: iso } : m));
            ToastAndroid.show(`Date updated for ${ids.length} items`, ToastAndroid.SHORT);
            clearSelection();
        } catch {
            Alert.alert('Error', 'Failed to update dates.');
        }
    };

    const handleSetCoverFromHero = () => {
        Alert.alert('Set Cover', 'Long-press any photo in the album to start selecting, then use the context menu.');
    };

    const handleAddPress = () => {
        Alert.alert('Add Media to Album', 'Choose a source', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Select from Gallery', onPress: () => setAddModalVisible(true) },
            {
                text: 'Upload from Device',
                onPress: async () => {
                    const result = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 0, includeExtra: true });
                    if (result.assets && result.assets.length > 0) {
                        setUploadAssets(result.assets);
                        setUploadModalVisible(true);
                    }
                },
            },
        ]);
    };

    const selectedIdList = React.useMemo(() => Array.from(selectedIds), [selectedIds]);

    // ── Long-press context menu when NOT in selection mode (single item) ────
    const handleSingleLongPress = useCallback((item: Media) => {
        if (selectionMode) {
            toggleSelection(item.id);
            return;
        }
        Alert.alert('Photo Options', item.filename || 'Photo', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Select',
                onPress: () => toggleSelection(item.id),
            },
            {
                text: 'Set as Cover',
                onPress: async () => {
                    try {
                        const updatedAlbum = await setAlbumCover(albumId, item.id);
                        if (updatedAlbum.cover_url) { setCoverUrl(updatedAlbum.cover_url); }
                        ToastAndroid.show('Album cover updated', ToastAndroid.SHORT);
                    } catch {
                        Alert.alert('Error', 'Failed to set cover');
                    }
                },
            },
            {
                text: 'Remove from Album',
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
    }, [albumId, selectionMode, toggleSelection]);

    // ── Render ─────────────────────────────────────────────────────────────
    const listHeader = (
        <View style={styles.listHeader}>
            <Text style={styles.listHeaderName}>{albumName}</Text>
            <Text style={styles.listHeaderCount}>{media.length} items</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

            {/* Compact sticky header (appears when scrolled down past hero) */}
            <Animated.View
                style={[styles.compactHeader, { paddingTop: insets.top, opacity: compactHeaderOpacity }]}
                pointerEvents="box-none"
            >
                {selectionMode ? (
                    <>
                        <TouchableOpacity onPress={clearSelection} style={styles.compactBackBtn} hitSlop={15}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.compactTitle}>{selectedIds.size} selected</Text>
                        <View style={{ width: 40 }} />
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.compactBackBtn} hitSlop={15}>
                            <ArrowLeft size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.compactTitle} numberOfLines={1}>{albumName}</Text>
                        <View style={{ width: 40 }} />
                    </>
                )}
            </Animated.View>

            {/* Transparent back button over hero (hidden during selection) */}
            <Animated.View
                style={[styles.heroBackBtn, { top: insets.top + 8, opacity: heroOpacity }]}
                pointerEvents="box-none"
            >
                {selectionMode ? (
                    <TouchableOpacity onPress={clearSelection} hitSlop={15} style={styles.heroBackBtnInner}>
                        <X size={24} color="#fff" />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={15} style={styles.heroBackBtnInner}>
                        <ArrowLeft size={24} color="#fff" />
                    </TouchableOpacity>
                )}
            </Animated.View>

            <MediaGrid
                ref={gridRef}
                media={media}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onPressItem={handlePressItem}
                onLongPressItem={handleSingleLongPress}
                onToggleGroup={toggleDateGroup}
                loading={loading}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomPadding={selectionMode ? insets.bottom + 180 : insets.bottom + 100}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                ListHeaderComponent={
                    <View>
                        {/* Hero */}
                        <Animated.View style={[styles.hero, { opacity: heroOpacity }]}>
                            {coverUrl ? (
                                <RemoteImage uri={coverUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            ) : (
                                <View style={[StyleSheet.absoluteFill, styles.heroPlaceholderBg]}>
                                    <ImageIcon size={80} color="rgba(255,255,255,0.3)" />
                                </View>
                            )}
                            <View style={styles.heroGradient} />
                            <View style={[styles.heroContent, { paddingBottom: 20, paddingTop: insets.top + 56 }]}>
                                <Text style={styles.heroAlbumName}>{albumName}</Text>
                                <Text style={styles.heroCount}>{loading ? '…' : `${media.length} items`}</Text>
                            </View>
                            <TouchableOpacity style={styles.heroCoverEditBtn} onPress={handleSetCoverFromHero}>
                                <Camera size={18} color="#fff" />
                            </TouchableOpacity>
                        </Animated.View>
                        {listHeader}
                    </View>
                }
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <ImageIcon size={64} color="#ccc" style={styles.emptyIcon} />
                            <Text style={styles.emptyTitle}>Empty Album</Text>
                        </View>
                    ) : null
                }
            />

            {/* FAB — hidden in selection mode */}
            {!selectionMode && (
                <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom + 16, 16) }]} onPress={handleAddPress}>
                    <Plus size={28} color="#fff" />
                </TouchableOpacity>
            )}

            {/* ── Selection action bar ─────────────────────────────────── */}
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
                <View style={styles.bottomBarInner}>
                    <View style={styles.selectionTitleRow}>
                        <TouchableOpacity onPress={clearSelection} style={styles.closeSelectBtn}>
                            <X size={22} color="#444" />
                        </TouchableOpacity>
                        <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
                    </View>
                    <View style={styles.bottomBarActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectAlbumVisible(true)}>
                            <Text style={styles.actionIcon}>📁</Text>
                            <Text style={styles.actionText}>Add to</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleBulkFavorite}>
                            <Heart size={22} color="#444" />
                            <Text style={styles.actionText}>Favorite</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setBulkDatePickerVisible(true)}>
                            <CalendarDays size={22} color="#444" />
                            <Text style={styles.actionText}>Date</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleBulkRemove}>
                            <FolderMinus size={22} color="#e53935" />
                            <Text style={[styles.actionText, { color: '#e53935' }]}>Remove</Text>
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

            <SelectAlbumModal
                visible={selectAlbumVisible}
                mediaIds={selectedIdList}
                onClose={() => setSelectAlbumVisible(false)}
                onAdded={clearSelection}
            />

            {/* Bulk Date Picker */}
            <Modal
                visible={bulkDatePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setBulkDatePickerVisible(false)}
            >
                <AlbumBulkDateModal
                    count={selectedIds.size}
                    onConfirm={handleBulkDateChange}
                    onCancel={() => setBulkDatePickerVisible(false)}
                />
            </Modal>
        </View>
    );
};

export default AlbumDetailScreen;

// ── Bulk date picker modal ─────────────────────────────────────────────────

const AlbumBulkDateModal = ({ count, onConfirm, onCancel }: {
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
        <View style={ds.overlay}>
            <View style={ds.sheet}>
                <Text style={ds.title}>Set Date for {count} item{count > 1 ? 's' : ''}</Text>
                <Text style={ds.subtitle}>All selected items will use this date.</Text>
                <View style={ds.row}>
                    {([
                        ['Year', year, setYear, 4],
                        ['Month', month, setMonth, 2],
                        ['Day', day, setDay, 2],
                        ['Hour', hour, setHour, 2],
                        ['Min', minute, setMinute, 2],
                    ] as const).map(([lbl, val, setter, max], i) => (
                        <React.Fragment key={i}>
                            {i === 3 && <Text style={ds.sep}>  </Text>}
                            {i > 0 && i < 3 && <Text style={ds.sep}>/</Text>}
                            {i === 4 && <Text style={ds.sep}>:</Text>}
                            <View style={ds.field}>
                                <Text style={ds.label}>{lbl}</Text>
                                <TextInput
                                    style={ds.input}
                                    value={val}
                                    onChangeText={setter as (v: string) => void}
                                    keyboardType="number-pad"
                                    maxLength={max}
                                />
                            </View>
                        </React.Fragment>
                    ))}
                </View>
                <View style={ds.actions}>
                    <Pressable style={ds.cancelBtn} onPress={onCancel}>
                        <Text style={ds.cancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={ds.confirmBtn} onPress={handleConfirm}>
                        <Text style={ds.confirmText}>Apply</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Compact header
    compactHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: 10,
        backgroundColor: 'rgba(26,26,26,0.92)',
    },
    compactBackBtn: { padding: 8 },
    compactTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },

    // Transparent back button over hero
    heroBackBtn: {
        position: 'absolute',
        left: 16,
        zIndex: 21,
    },
    heroBackBtnInner: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Hero
    hero: {
        width: SCREEN_WIDTH,
        height: HERO_HEIGHT,
        backgroundColor: '#1a1a2e',
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    heroPlaceholderBg: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#2a2a3e',
    },
    heroGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 180,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    heroContent: { paddingHorizontal: 20 },
    heroAlbumName: {
        fontSize: 32,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
        textShadowColor: 'rgba(0,0,0,0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    heroCount: { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
    heroCoverEditBtn: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // List header strip
    listHeader: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    listHeaderName: { fontSize: 20, fontWeight: '700', color: '#1a1a2e' },
    listHeaderCount: { fontSize: 13, color: '#888', marginTop: 2 },

    // Empty
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#3c4043', marginBottom: 8 },

    // FAB
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

    // Selection bottom bar
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#e0e0e0',
        elevation: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    bottomBarInner: { paddingHorizontal: 16, paddingTop: 12 },
    selectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    closeSelectBtn: { padding: 4, marginRight: 8 },
    selectionCount: { fontSize: 16, fontWeight: '600', color: '#111' },
    bottomBarActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingBottom: 4,
    },
    actionBtn: { alignItems: 'center', minWidth: 64, gap: 4 },
    actionIcon: { fontSize: 22 },
    actionText: { fontSize: 12, color: '#444', fontWeight: '500' },
});

const ds = StyleSheet.create({
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
