import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Animated, Pressable, TextInput } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, ArrowLeft, Search, Plus, X } from 'lucide-react-native';
import { radii } from '../Albums/theme';

import MediaGrid, { MediaGridHandle } from '../../components/MediaGrid';
import MediaViewer from '../Gallery/MediaViewer';
import { PhotoPickerModal } from '../../components/PhotoPickerModal';
import { getMedia, bulkFavorite } from '../../api/media';
import { Media } from '../../types/media';
import { useTheme } from '../../context/ThemeContext';

const FavoritesScreen = () => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const gridRef = useRef<MediaGridHandle>(null);
    const navigation = useNavigation<any>();

    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchAnim = useRef(new Animated.Value(0)).current;

    const [pickerVisible, setPickerVisible] = useState(false);

    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);
    const hasLoadedRef = useRef(false);
    const viewerOpenRef = useRef(false);

    const fetchFavorites = useCallback(async (pageNumber: number, query: string = '') => {
        if (pageNumber > 1 && busyRef.current) { return; }
        busyRef.current = true;
        if (pageNumber > 1) { setLoadingMore(true); }
        try {
            const data = await getMedia({ page: pageNumber, isFavorite: true, search: query });
            setMedia(prev => {
                if (pageNumber === 1) { return data.results; }
                const existing = new Set(prev.map(m => m.id));
                return [...prev, ...data.results.filter(m => !existing.has(m.id))];
            });
            pageRef.current = pageNumber;
            hasMoreRef.current = !!data.next;
            hasLoadedRef.current = true;
        } catch (err) {
            console.error('Failed to fetch favorites', err);
        } finally {
            busyRef.current = false;
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            pageRef.current = 1;
            hasMoreRef.current = true;
            fetchFavorites(1, searchQuery);
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchQuery, fetchFavorites]);

    // Favorites change from other tabs: refresh quietly when the tab regains focus.
    useFocusEffect(useCallback(() => {
        if (hasLoadedRef.current && !viewerOpenRef.current) {
            fetchFavorites(1, searchQuery);
        }
    }, [fetchFavorites, searchQuery]));

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchFavorites(1, searchQuery);
    }, [fetchFavorites, searchQuery]);

    const onEndReached = useCallback(() => {
        if (hasMoreRef.current) {
            fetchFavorites(pageRef.current + 1, searchQuery);
        }
    }, [fetchFavorites, searchQuery]);

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

    const openSearch = () => {
        setSearchVisible(true);
        Animated.spring(searchAnim, { toValue: 1, useNativeDriver: false, damping: 18, stiffness: 220 }).start();
    };
    const closeSearch = () => {
        Animated.timing(searchAnim, { toValue: 0, duration: 160, useNativeDriver: false }).start(() => {
            setSearchVisible(false);
            setSearchQuery('');
        });
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                {searchVisible ? (
                    <Animated.View
                        style={[
                            styles.searchPill,
                            {
                                opacity: searchAnim,
                                transform: [{ scaleX: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
                            },
                        ]}
                    >
                        <Search size={20} color={colors.onSurfaceVariant} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search favorites"
                            placeholderTextColor={colors.onSurfaceVariant}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                            returnKeyType="search"
                        />
                        <Pressable onPress={closeSearch} hitSlop={10} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 18 }} style={styles.roundIconBtn}>
                            <X size={18} color={colors.onSurfaceVariant} />
                        </Pressable>
                    </Animated.View>
                ) : (
                    <>
                        <Pressable onPress={() => navigation.goBack()} hitSlop={12} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }} style={styles.roundIconBtn}>
                            <ArrowLeft size={24} color={colors.onSurface} />
                        </Pressable>
                        <Text style={styles.heading}>Favorites</Text>
                        <View style={styles.headerRightIcons}>
                            <Pressable onPress={openSearch} hitSlop={12} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }} style={styles.roundIconBtn}>
                                <Search size={22} color={colors.onSurface} />
                            </Pressable>
                            <Pressable onPress={() => setPickerVisible(true)} hitSlop={12} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }} style={styles.roundIconBtn}>
                                <Plus size={24} color={colors.onSurface} />
                            </Pressable>
                        </View>
                    </>
                )}
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
                        <Heart size={64} color={colors.onSurfaceVariant} style={styles.emptyIcon} />
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

            <PhotoPickerModal
                visible={pickerVisible}
                onClose={() => setPickerVisible(false)}
                onConfirm={async (items) => {
                    setPickerVisible(false);
                    try {
                        await bulkFavorite(items.map(m => m.id), true);
                        fetchFavorites(1, searchQuery); // Refresh grid
                    } catch (e) {
                        console.error('Failed to add to favorites', e);
                    }
                }}
            />
        </View>
    );
};

export default FavoritesScreen;

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 12, backgroundColor: colors.background },
    roundIconBtn: { padding: 10, borderRadius: radii.full },
    heading: { flex: 1, fontSize: 22, fontWeight: '500', color: colors.text, marginLeft: 4 },
    headerRightIcons: { flexDirection: 'row', alignItems: 'center' },

    searchPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceVariant,
        borderRadius: radii.full, paddingHorizontal: 14, height: 48, marginHorizontal: 4,
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 16, color: colors.onSurface, paddingVertical: 0 },

    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
});
