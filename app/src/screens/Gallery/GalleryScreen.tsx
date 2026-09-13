import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ToastAndroid,
    Animated,
    Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, Asset } from 'react-native-image-picker';

import { ImageOff, Heart, Check, Image as ImageIcon, Trash2, X, Plus, Search, Download, FolderPlus } from 'lucide-react-native';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import MediaViewer from './MediaViewer';
import VideoThumbnail from '../../components/VideoThumbnail';
import { prefetchThumbnails } from '../../utils/prefetch';
import { getMedia, bulkTrash, bulkFavorite, downloadMediaToDevice } from '../../api/media';
import { Media } from '../../types/media';
import { useAuth } from '../../context/AuthContext';
import UploadPreviewModal from './UploadPreviewModal';
import SelectAlbumModal from '../Albums/SelectAlbumModal';

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

type LoadState = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';

type ListItem =
    | { type: 'header'; title: string; id: string; mediaIds: number[] }
    | { type: 'row'; items: Media[]; id: string };

const GalleryScreen = () => {
    const { logout, user } = useAuth();
    const insets = useSafeAreaInsets();
    
    const [media, setMedia] = useState<Media[]>([]);
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const [previewVisible, setPreviewVisible] = useState(false);
    const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    
    // Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    
    const [selectAlbumVisible, setSelectAlbumVisible] = useState(false);

    // Animations
    const selectionAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(selectionAnim, {
            toValue: selectionMode ? 1 : 0,
            duration: 250,
            useNativeDriver: true,
        }).start();
    }, [selectionMode]);

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
            const search = searchQuery.trim() || undefined;
            const response = await getMedia(pageNumber, false, search, undefined);

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
    }, [logout, searchQuery]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchMedia(1, 'initial');
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const onRefresh = useCallback(() => {
        fetchMedia(1, 'refresh');
    }, [fetchMedia]);

    const onEndReached = useCallback(() => {
        if (loadState === 'idle' && hasMore) {
            fetchMedia(page + 1, 'more');
        }
    }, [loadState, hasMore, page, fetchMedia]);

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
                            <Animated.View style={[
                                styles.cellImageContainer,
                                isSelected && { transform: [{ scale: 0.85 }], borderRadius: 12 }
                            ]}>
                                {mediaItem.media_type === 'video' ? (
                                    <VideoThumbnail thumbnailUrl={mediaItem.thumbnail_url} duration={mediaItem.duration} />
                                ) : mediaItem.thumbnail_url ? (
                                    <AuthenticatedImage uri={mediaItem.thumbnail_url} style={styles.cellImage} resizeMode="cover" cacheOnDisk={true} />
                                ) : (
                                    <View style={styles.noThumb}><ImageOff size={24} color="#ccc" /></View>
                                )}
                            </Animated.View>

                            {mediaItem.is_favorite && !selectionMode && (
                                <View style={styles.favoriteBadge}>
                                    <Heart size={16} color="#FF3B30" fill="#FF3B30" />
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

    const handleAddAlbum = () => {
        setSelectAlbumVisible(true);
    };

    return (
        <View style={styles.container}>
            {/* Search Pill */}
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
                    <View style={styles.profileAvatar}>
                        <Text style={styles.profileInitial}>{user?.first_name?.charAt(0).toUpperCase() || 'U'}</Text>
                    </View>
                </View>
            </View>

            {loadState === 'loading' && media.length === 0 ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            ) : (
                <FlatList
                    data={listData}
                    extraData={selectedIds}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
                    // Performance Props for smoothness
                    windowSize={11}
                    maxToRenderPerBatch={10}
                    updateCellsBatchingPeriod={50}
                    removeClippedSubviews={true}
                    initialNumToRender={10}
                    refreshControl={<RefreshControl refreshing={loadState === 'refreshing'} onRefresh={onRefresh} />}
                    onEndReached={onEndReached}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                        loadState === 'loadingMore' ? (
                            <ActivityIndicator style={styles.footerSpinner} color="#555" />
                        ) : <></>
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <ImageIcon size={64} color="#ccc" style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyTitle}>No photos found</Text>
                        </View>
                    }
                />
            )}

            {!selectionMode && (
                <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom + 16, 16) }]} onPress={handleUpload}>
                    <Plus size={28} color="#fff" />
                </TouchableOpacity>
            )}

            {/* Sliding Bottom Action Bar for Selection Mode */}
            <Animated.View style={[
                styles.bottomBar,
                { 
                    paddingBottom: Math.max(insets.bottom, 16),
                    transform: [{
                        translateY: selectionAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [150, 0] // Slide up from bottom
                        })
                    }]
                }
            ]}>
                <View style={styles.bottomBarContent}>
                    <View style={styles.selectionTitleRow}>
                        <TouchableOpacity onPress={() => setSelectionMode(false)} style={styles.closeSelectBtn}>
                            <X size={24} color="#444" />
                        </TouchableOpacity>
                        <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
                    </View>
                    <View style={styles.bottomBarActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleAddAlbum}>
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

            <SelectAlbumModal
                visible={selectAlbumVisible}
                mediaId={Array.from(selectedIds)[0]}
                onClose={() => {
                    setSelectAlbumVisible(false);
                    setSelectionMode(false);
                    setSelectedIds(new Set());
                }}
            />
        </View>
    );
};

export default GalleryScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: '#fff',
    },
    searchPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f3f4', // Google standard search background
        borderRadius: 24,
        paddingHorizontal: 16,
        height: 48,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#222',
        paddingVertical: 0, // important for Android
    },
    profileAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#1a73e8', // Google Blue
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    profileInitial: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },

    dateHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14 },
    dateHeaderText: { fontSize: 16, fontWeight: '600', color: '#3c4043' },
    dateGroupSelectBtn: { padding: 4 },
    dateGroupCheckBadge: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#dadce0', justifyContent: 'center', alignItems: 'center' },
    dateGroupCheckBadgeActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8', borderWidth: 0 },

    row: { flexDirection: 'row', width: '100%' },
    cell: { width: CELL, height: CELL, margin: 0.5, overflow: 'hidden' },
    cellImageContainer: { flex: 1, backgroundColor: '#eee', overflow: 'hidden' },
    cellImage: { width: '100%', height: '100%' },
    noThumb: { flex: 1, backgroundColor: '#f1f3f4', justifyContent: 'center', alignItems: 'center' },
    
    favoriteBadge: { 
        position: 'absolute', 
        top: 6, 
        left: 6, 
        padding: 4,
    },

    selectionOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 6 },
    processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    checkBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1.5, borderColor: '#fff' },

    footerSpinner: { paddingVertical: 24 },
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 18, fontWeight: '500', color: '#3c4043', marginBottom: 8 },
    
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
        shadowRadius: 5 
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
    bottomBarContent: {
        paddingTop: 16,
        paddingHorizontal: 16,
    },
    selectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    closeSelectBtn: {
        marginRight: 16,
    },
    selectionCount: { 
        fontSize: 18, 
        fontWeight: '500', 
        color: '#222' 
    },
    bottomBarActions: { 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingBottom: 8,
    },
    actionBtn: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#444',
        marginTop: 6,
    }
});
