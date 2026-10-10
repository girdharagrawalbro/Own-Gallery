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
    TouchableOpacity,
    View,
    StatusBar,
    Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft,
    CalendarDays,
    FolderMinus,
    Image as ImageIcon,
    Share2,
    SquarePen,
    Plus,
    X,
    MoreVertical,
    Check,
    MapPin,
    Trash2,
    Cast,
    Sparkles,
} from 'lucide-react-native';
import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from '../Gallery/MediaViewer';
import AddMediaModal from './AddMediaModal';
// TODO: "Upload from device" (react-native-image-picker → UploadPreviewModal) was part of the
// original flow. Re-import UploadPreviewModal, add back `launchImageLibrary`/`Asset` from
// 'react-native-image-picker', and a trigger (e.g. a second row in the "more" menu) if you want
// both an in-app gallery picker and a device-upload picker reachable from this screen.
import SelectAlbumModal from './SelectAlbumModal';
import AlbumEditModal from './AlbumEditModal';
import RemoteImage from '../../components/RemoteImage';
import { getAlbumMedia, removeMediaFromAlbum, updateAlbum, deleteAlbum, addMediaToAlbum } from '../../api/albums';
import { bulkUpdateTakenAt } from '../../api/media';
import { Media } from '../../types/media';
import { useUploadActions } from '../../context/UploadContext';
import { formatDateRange, mediaDate, dayKey } from '../../utils/format';
import { radii, elevation, rippleOnDark } from './theme';
import { useTheme } from '../../context/ThemeContext';
import { BottomSheetMenu, Snackbar, SnackbarState, haptics } from './AlbumUIKit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 600;
const EMPTY_SELECTION = new Set<number>();

const AlbumDetailScreen = () => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
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
    const [albumName, setAlbumName] = useState(initialAlbumName);
    const [albumDescription, setAlbumDescription] = useState('');

    // ── Name inline editing ─────────────────────────────────────────────────
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(initialAlbumName);

    // ── Selection state ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<number>>(EMPTY_SELECTION);
    const selectionMode = selectedIds.size > 0;
    const [selectAlbumVisible, setSelectAlbumVisible] = useState(false);
    const [bulkDatePickerVisible, setBulkDatePickerVisible] = useState(false);
    const [selectionMoreVisible, setSelectionMoreVisible] = useState(false);

    // ── Snackbar (undo) ──────────────────────────────────────────────────────
    const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

    const selectionAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(selectionAnim, {
            toValue: selectionMode ? 1 : 0,
            useNativeDriver: true,
            damping: 20,
            mass: 0.9,
            stiffness: 220,
        }).start();
    }, [selectionMode, selectionAnim]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (selectionMode) { setSelectedIds(EMPTY_SELECTION); return true; }
            if (editingName) { setEditingName(false); setNameDraft(albumName); return true; }
            return false;
        });
        return () => sub.remove();
    }, [selectionMode, editingName, albumName]);

    const clearSelection = useCallback(() => setSelectedIds(EMPTY_SELECTION), []);

    const toggleSelection = useCallback((id: number) => {
        hapticSelection();
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

    // ── Viewer / modal state ────────────────────────────────────────────────
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [albumMenuVisible, setAlbumMenuVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);

    const scrollY = useRef(new Animated.Value(0)).current;

    const heroOpacity = scrollY.interpolate({
        inputRange: [0, HERO_HEIGHT - 56 - insets.top],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });
    // Overscrolling down (negative scrollY) gently zooms the hero, like a pull-to-reveal.
    const heroScale = scrollY.interpolate({
        inputRange: [-150, 0],
        outputRange: [1.25, 1],
        extrapolate: 'clamp',
    });
    const heroTranslate = scrollY.interpolate({
        inputRange: [0, HERO_HEIGHT],
        outputRange: [0, -HERO_HEIGHT * 0.3],
        extrapolate: 'clamp',
    });

    const compactHeaderOpacity = selectionAnim;
    const backBtnOpacity = selectionAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

    // ── Data ───────────────────────────────────────────────────────────────
    const fetchMedia = useCallback(async () => {
        try {
            const data = await getAlbumMedia(albumId);
            setMedia(data.media);
            if (data.album?.cover_url) setCoverUrl(data.album.cover_url);
            else if (data.media.length > 0 && !coverUrl) {
                setCoverUrl(data.media[0].thumbnail_url || data.media[0].preview_url || null);
            }
            if (data.album?.name) { setAlbumName(data.album.name); setNameDraft(data.album.name); }
            if (typeof data.album?.description === 'string') setAlbumDescription(data.album.description);
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
        if (selectionMode) { toggleSelection(item.id); }
        else if (index >= 0) { setSelectedIndex(index); setViewerVisible(true); }
    }, [selectionMode, toggleSelection]);

    const handleLongPress = useCallback((item: Media) => {
        if (!selectionMode) haptics.selectionStart();
        toggleSelection(item.id);
    }, [selectionMode, toggleSelection]);

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

    // ── Bulk / selection actions ────────────────────────────────────────────
    const handleBulkRemove = useCallback(() => {
        const ids = Array.from(selectedIds);
        const removedItems = media.filter(m => ids.includes(m.id));
        setSelectionMoreVisible(false);
        setMedia(prev => prev.filter(m => !ids.includes(m.id)));
        clearSelection();
        removeMediaFromAlbum(albumId, ids).catch(() => {
            // Roll back optimistic removal on failure.
            setMedia(prev => [...removedItems, ...prev]);
            Alert.alert('Error', 'Failed to remove items.');
        });
        setSnackbar({
            message: `${ids.length} item${ids.length > 1 ? 's' : ''} removed from album`,
            actionLabel: 'Undo',
            onAction: async () => {
                try {
                    await addMediaToAlbum(albumId, ids);
                    fetchMedia();
                } catch {
                    Alert.alert('Error', 'Failed to undo removal.');
                }
            },
        });
    }, [selectedIds, media, albumId, clearSelection, fetchMedia]);

    const handleBulkMoveToBin = useCallback(() => {
        const ids = Array.from(selectedIds);
        setSelectionMoreVisible(false);
        // TODO(api): No "move to bin" / trash endpoint is present in the provided api/media.ts.
        // Wire this to your soft-delete endpoint once available, e.g. bulkMoveToBin(ids).
        Alert.alert('Move to Bin', `Move ${ids.length} item${ids.length > 1 ? 's' : ''} to the bin?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Move to Bin', style: 'destructive', onPress: () => Alert.alert('Not implemented', 'Hook this up to your trash/bin API.') },
        ]);
    }, [selectedIds]);

    const handleBulkDateChange = async (date: Date) => {
        setBulkDatePickerVisible(false);
        const ids = Array.from(selectedIds);
        try {
            await bulkUpdateTakenAt(ids, date);
            const iso = date.toISOString();
            setMedia(prev => prev.map(m => ids.includes(m.id) ? { ...m, taken_at: iso } : m));
            setSnackbar({ message: `Date updated for ${ids.length} item${ids.length > 1 ? 's' : ''}` });
            clearSelection();
        } catch {
            Alert.alert('Error', 'Failed to update dates.');
        }
    };

    const handleEditLocation = useCallback(() => {
        setSelectionMoreVisible(false);
        // TODO(api & types/media.ts): Media has no lat/lng or place field yet. Add one, then
        // build a location picker here and persist it (e.g. bulkUpdateLocation(ids, coords)).
        Alert.alert('Edit Location', 'Location editing isn\u2019t wired up yet — add a location field to Media first.');
    }, []);

    const handleSelectionShare = useCallback(() => {
        // TODO: hook into your native Share sheet / existing album-share flow with the
        // selected media ids, e.g. Share.share({ url: buildShareLink(albumId, selectedIds) }).
        Alert.alert('Share', 'Share the selected items via your existing share flow.');
    }, []);

    const handleAlbumShare = useCallback(() => {
        // TODO: same as above but for the whole album.
        Alert.alert('Share Album', 'Share this album via your existing share flow.');
    }, []);

    // ── Top "more" menu (select photos / auto add / cast / delete) ─────────
    const handleAddPress = () => setAddModalVisible(true);

    // TODO: an "Upload from device" entry point (launchImageLibrary → UploadPreviewModal, which
    // is already wired below) was in the original flow. Add a second row to the "more" menu or
    // a long-press on "Select photos" to bring it back if you want both sources reachable.

    const handleAutoAddPhotos = useCallback(() => {
        // TODO(api): "Auto add" (e.g. by person/place rules) needs a dedicated backend endpoint
        // and rule-builder UI. Not present in the provided codebase — stubbed for now.
        Alert.alert('Auto Add Photos', 'Set up rules to automatically add matching photos. Not implemented yet.');
    }, []);

    const handleCast = useCallback(() => {
        // TODO: integrate with a casting SDK (Chromecast/AirPlay) to stream the album.
        Alert.alert('Cast', 'Casting isn\u2019t wired up yet — integrate a casting SDK here.');
    }, []);

    const handleDeleteAlbum = useCallback(() => {
        Alert.alert(
            'Delete Album',
            'Are you sure you want to delete this album? The photos inside will not be deleted.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteAlbum(albumId);
                            navigation.goBack();
                        } catch (error) {
                            console.error('Delete failed', error);
                            Alert.alert('Error', 'Failed to delete album');
                        }
                    },
                },
            ],
        );
    }, [albumId, navigation]);

    // ── Inline name editing ─────────────────────────────────────────────────
    const startEditingName = () => {
        if (selectionMode) return;
        setNameDraft(albumName);
        setEditingName(true);
    };

    const confirmNameEdit = async () => {
        const trimmed = nameDraft.trim();
        if (!trimmed || trimmed === albumName) {
            setEditingName(false);
            setNameDraft(albumName);
            return;
        }
        try {
            await updateAlbum(albumId, { name: trimmed });
            setAlbumName(trimmed);
            setEditingName(false);
            setSnackbar({ message: 'Album renamed' });
        } catch (error) {
            console.error('Rename failed', error);
            Alert.alert('Error', 'Failed to rename album');
        }
    };

    const selectedIdList = React.useMemo(() => Array.from(selectedIds), [selectedIds]);

    const shouldGroupByDate = React.useMemo(() => {
        if (!media || media.length === 0) return false;
        const firstDay = dayKey(mediaDate(media[0]));
        for (let i = 1; i < media.length; i++) {
            if (dayKey(mediaDate(media[i])) !== firstDay) return true;
        }
        return false;
    }, [media]);

    return (
        <View style={styles.container}>
            {/* @ts-ignore */}
            <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

            {/* Compact sticky header for selection mode */}
            <Animated.View
                style={[styles.compactHeader, { paddingTop: insets.top, opacity: compactHeaderOpacity }]}
                pointerEvents={selectionMode ? 'auto' : 'none'}
            >
                {selectionMode && (
                    <>
                        <View style={styles.compactLeft}>
                            <Pressable onPress={clearSelection} style={styles.compactIconBtn} hitSlop={15} android_ripple={rippleOnDark}>
                                <X size={22} color="#fff" />
                            </Pressable>
                            <Text style={styles.compactTitle}>{selectedIds.size}</Text>
                        </View>
                        <View style={styles.compactRight}>
                            <Pressable onPress={handleSelectionShare} style={styles.compactIconBtn} hitSlop={15} android_ripple={rippleOnDark}>
                                <Share2 size={20} color="#fff" />
                            </Pressable>
                            <Pressable onPress={() => setSelectAlbumVisible(true)} style={styles.compactIconBtn} hitSlop={15} android_ripple={rippleOnDark}>
                                <Plus size={22} color="#fff" />
                            </Pressable>
                            <Pressable onPress={() => setSelectionMoreVisible(true)} style={styles.compactIconBtn} hitSlop={15} android_ripple={rippleOnDark}>
                                <MoreVertical size={22} color="#fff" />
                            </Pressable>
                        </View>
                    </>
                )}
            </Animated.View>

            <Animated.View style={[styles.heroBackBtn, { top: insets.top + 8, opacity: backBtnOpacity }]} pointerEvents="box-none">
                <Pressable onPress={() => navigation.goBack()} hitSlop={15} style={styles.heroBackBtnInner} android_ripple={rippleOnDark}>
                    <ArrowLeft size={24} color="#fff" />
                </Pressable>
            </Animated.View>

            <Animated.View style={[styles.heroOptionsBtn, { top: insets.top + 8, opacity: backBtnOpacity }]} pointerEvents="box-none">
                {editingName ? (
                    <Pressable onPress={confirmNameEdit} hitSlop={15} style={styles.heroBackBtnInner} android_ripple={rippleOnDark}>
                        <Check size={22} color="#fff" />
                    </Pressable>
                ) : (
                    <Pressable onPress={() => setAlbumMenuVisible(true)} hitSlop={15} style={styles.heroBackBtnInner} android_ripple={rippleOnDark}>
                        <MoreVertical size={24} color="#fff" />
                    </Pressable>
                )}
            </Animated.View>

            <MediaGrid
                ref={gridRef}
                media={media}
                groupByDate={shouldGroupByDate}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onPressItem={handlePressItem}
                onLongPressItem={handleLongPress}
                onToggleGroup={toggleDateGroup}
                loading={loading}
                refreshing={refreshing}
                onRefresh={onRefresh}
                bottomPadding={selectionMode ? insets.bottom + 180 : insets.bottom + 110}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                ListHeaderComponent={
                    <View>
                        <Animated.View
                            style={[
                                styles.hero,
                                { opacity: heroOpacity, marginBottom: 2, transform: [{ scale: heroScale }, { translateY: heroTranslate }] },
                            ]}
                        >
                            {coverUrl ? (
                                <RemoteImage uri={coverUrl.replace('/thumbnail/', '/preview/')} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            ) : (
                                <View style={[StyleSheet.absoluteFill, styles.heroPlaceholderBg]}>
                                    <ImageIcon size={80} color="rgba(255,255,255,0.3)" />
                                </View>
                            )}
                            <View style={styles.heroGradient} />
                            <View style={[styles.heroContent, { paddingBottom: 20, paddingTop: insets.top + 56 }]}>
                                {editingName ? (
                                    <TextInput
                                        style={styles.heroAlbumNameInput}
                                        value={nameDraft}
                                        onChangeText={setNameDraft}
                                        autoFocus
                                        selectTextOnFocus
                                        onSubmitEditing={confirmNameEdit}
                                        returnKeyType="done"
                                    />
                                ) : (
                                    <Pressable onPress={startEditingName}>
                                        <Text style={styles.heroAlbumName}>{albumName}</Text>
                                    </Pressable>
                                )}
                                <Text style={styles.heroCount}>
                                    {loading ? '…' : (
                                        (() => {
                                            const countStr = `${media.length} items`;
                                            if (media.length === 0) return countStr;
                                            let minTime = Infinity;
                                            let maxTime = -Infinity;
                                            for (const m of media) {
                                                const t = mediaDate(m).getTime();
                                                if (t < minTime) minTime = t;
                                                if (t > maxTime) maxTime = t;
                                            }
                                            if (minTime === Infinity) return countStr;
                                            const rangeStr = formatDateRange(new Date(minTime), new Date(maxTime));
                                            return `${rangeStr} • ${countStr}`;
                                        })()
                                    )}
                                </Text>
                            </View>
                        </Animated.View>
                    </View>
                }
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <ImageIcon size={64} color="#ccc" style={styles.emptyIcon} />
                            <Text style={styles.emptyTitle}>Empty Album</Text>
                        </View>
                    ) : undefined
                }
            />

            {/* Floating bottom bar — hidden in selection mode: Share / Edit / Add image */}
            {!selectionMode && (
                <View style={[styles.floatingBar, { bottom: Math.max(insets.bottom + 16, 16) }]}>
                    <Pressable style={styles.floatingBarBtn} onPress={handleAlbumShare} hitSlop={10} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }}>
                        <Share2 size={22} color={colors.onSurface} />
                    </Pressable>
                    <Pressable style={styles.floatingBarBtn} onPress={() => setEditModalVisible(true)} hitSlop={10} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }}>
                        <SquarePen size={22} color={colors.onSurface} />
                    </Pressable>
                    <Pressable style={styles.floatingBarBtn} onPress={handleAddPress} hitSlop={10} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }}>
                        <ImageIcon size={22} color={colors.onSurface} />
                    </Pressable>
                </View>
            )}

            <MediaViewer
                visible={viewerVisible}
                media={media}
                initialIndex={selectedIndex}
                onClose={handleViewerClose}
                onMediaUpdated={handleMediaUpdated}
                onMediaDeleted={handleMediaDeleted}
            />

            <AddMediaModal visible={addModalVisible} albumId={albumId} onClose={() => setAddModalVisible(false)} onAdded={onRefresh} />

            <SelectAlbumModal
                visible={selectAlbumVisible}
                mediaIds={selectedIdList}
                onClose={() => setSelectAlbumVisible(false)}
                onAdded={clearSelection}
            />

            <AlbumEditModal
                visible={editModalVisible}
                albumId={albumId}
                albumName={albumName}
                albumDescription={albumDescription}
                coverUrl={coverUrl}
                media={media}
                onClose={() => setEditModalVisible(false)}
                onSaved={({ name, description, coverUrl: newCover }) => {
                    if (name) { setAlbumName(name); setNameDraft(name); }
                    if (typeof description === 'string') setAlbumDescription(description);
                    if (newCover) setCoverUrl(newCover);
                    fetchMedia();
                }}
            />

            <Modal visible={bulkDatePickerVisible} transparent animationType="fade" onRequestClose={() => setBulkDatePickerVisible(false)}>
                <AlbumBulkDateModal count={selectedIds.size} onConfirm={handleBulkDateChange} onCancel={() => setBulkDatePickerVisible(false)} />
            </Modal>

            <BottomSheetMenu
                visible={selectionMoreVisible}
                onClose={() => setSelectionMoreVisible(false)}
                items={[
                    { key: 'date', label: 'Edit date & time', icon: <CalendarDays size={20} color={colors.onSurface} />, onPress: () => setBulkDatePickerVisible(true) },
                    { key: 'location', label: 'Edit location', icon: <MapPin size={20} color={colors.onSurface} />, onPress: handleEditLocation },
                    { key: 'remove', label: 'Remove from album', icon: <FolderMinus size={20} color={colors.onSurface} />, onPress: handleBulkRemove },
                    { key: 'bin', label: 'Move to bin', icon: <Trash2 size={20} color={colors.error} />, destructive: true, onPress: handleBulkMoveToBin },
                ]}
            />

            <BottomSheetMenu
                visible={albumMenuVisible}
                onClose={() => setAlbumMenuVisible(false)}
                items={[
                    { key: 'select', label: 'Select photos', icon: <ImageIcon size={20} color={colors.onSurface} />, onPress: handleAddPress },
                    { key: 'auto', label: 'Auto add photos', icon: <Sparkles size={20} color={colors.onSurface} />, onPress: handleAutoAddPhotos },
                    { key: 'cast', label: 'Cast', icon: <Cast size={20} color={colors.onSurface} />, onPress: handleCast },
                    { key: 'delete', label: 'Delete album', icon: <Trash2 size={20} color={colors.error} />, destructive: true, onPress: handleDeleteAlbum },
                ]}
            />

            <Snackbar
                snackbar={snackbar}
                onDismiss={() => setSnackbar(null)}
                bottomOffset={selectionMode ? insets.bottom + 190 : insets.bottom + 90}
            />
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
    const { colors } = useTheme();
    const ds = React.useMemo(() => getDateStyles(colors), [colors]);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const [year, setYear] = React.useState(String(now.getFullYear()));
    const [month, setMonth] = React.useState(pad(now.getMonth() + 1));
    const [day, setDay] = React.useState(pad(now.getDate()));
    const [hour, setHour] = React.useState(pad(now.getHours()));
    const [minute, setMinute] = React.useState(pad(now.getMinutes()));

    const handleConfirm = () => {
        const d = new Date(
            parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10),
            parseInt(hour, 10), parseInt(minute, 10),
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
                    <Pressable style={ds.cancelBtn} android_ripple={{ color: 'rgba(0,0,0,0.06)' }} onPress={onCancel}>
                        <Text style={ds.cancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={ds.confirmBtn} android_ripple={{ color: 'rgba(255,255,255,0.2)' }} onPress={handleConfirm}>
                        <Text style={ds.confirmText}>Apply</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background || colors.surface },

    compactHeader: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 8, paddingBottom: 10, backgroundColor: 'rgba(26,26,26,0.92)',
    },
    compactLeft: { flexDirection: 'row', alignItems: 'center' },
    compactRight: { flexDirection: 'row', alignItems: 'center' },
    compactIconBtn: { padding: 8, borderRadius: radii.full },
    compactTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginLeft: 4 },

    heroBackBtn: { position: 'absolute', left: 16, zIndex: 21 },
    heroOptionsBtn: { position: 'absolute', right: 16, zIndex: 21 },
    heroBackBtnInner: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    },

    hero: {
        width: SCREEN_WIDTH, height: HERO_HEIGHT, backgroundColor: '#1a1a2e',
        overflow: 'hidden', justifyContent: 'flex-end',
    },
    heroPlaceholderBg: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#2a2a3e' },
    heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
    heroContent: { paddingHorizontal: 20, alignItems: 'center' },
    heroAlbumName: {
        fontSize: 38,
        fontWeight: Platform.OS === 'ios' ? '600' : 'normal',
        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
        color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4, textAlign: 'center', textTransform: 'uppercase',
        letterSpacing: 1, includeFontPadding: false,
    },
    heroAlbumNameInput: {
        fontSize: 32, fontWeight: '600', color: '#fff', textAlign: 'center',
        borderBottomWidth: 2, borderBottomColor: '#fff', minWidth: 200, paddingVertical: 4,
    },
    heroCount: { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },

    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },

    floatingBar: {
        position: 'absolute', alignSelf: 'center', flexDirection: 'row',
        backgroundColor: colors.surface, borderRadius: radii.full, paddingHorizontal: 12, paddingVertical: 8,
        gap: 20, ...elevation[3],
    },
    floatingBarBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
});

const getDateStyles = (colors: any) => StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 24, paddingBottom: 40 },
    title: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 6, textAlign: 'center' },
    subtitle: { fontSize: 13, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 20 },
    row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 24, gap: 4 },
    field: { alignItems: 'center' },
    label: { fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 4 },
    input: { backgroundColor: colors.surfaceVariant, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 10, fontSize: 18, fontWeight: '600', minWidth: 52, textAlign: 'center', color: colors.onSurface },
    sep: { fontSize: 18, fontWeight: '600', color: colors.onSurfaceVariant, marginBottom: 10, paddingHorizontal: 2 },
    actions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radii.md, backgroundColor: colors.surfaceVariant, alignItems: 'center', overflow: 'hidden' },
    cancelText: { color: colors.onSurface, fontSize: 16, fontWeight: '600' },
    confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: 'center', overflow: 'hidden' },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
