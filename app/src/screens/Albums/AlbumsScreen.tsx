import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    FlatList,
    Pressable,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft,
    Folder,
    Plus,
    Search,
    X,
    LayoutGrid,
    List as ListIcon,
    ArrowUpDown,
    Check,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import RemoteImage from '../../components/RemoteImage';
import { getAlbums } from '../../api/albums';
import { Album } from '../../types/album';
import { radii, elevation, ripple } from './theme';
import { BottomSheetMenu, SkeletonGrid, haptics } from './AlbumUIKit';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');
const CELL = (width - 48) / 2;

type SortOption = 'name' | 'newest' | 'oldest';
type ViewMode = 'grid' | 'list';

const SORT_LABELS: Record<SortOption, string> = {
    name: 'Name',
    newest: 'Newest first',
    oldest: 'Oldest first',
};

// Subtle staggered rise-and-fade for grid/list items as they first appear.
const FadeInItem = ({ index, children }: { index: number; children: React.ReactNode }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(10)).current;
    useEffect(() => {
        const delay = Math.min(index, 8) * 30;
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 220, delay, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, damping: 16, stiffness: 180 }),
        ]).start();
    }, []);
    return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
};

const AlbumsScreen = () => {
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchAnim = useRef(new Animated.Value(0)).current;

    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [sortMenuVisible, setSortMenuVisible] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    const {
        data: albumData,
        isLoading: loading,
        isRefetching: refreshing,
        refetch,
    } = useQuery({
        queryKey: ['albums', searchQuery],
        queryFn: () => getAlbums(1, searchQuery),
    });

    const albums = useMemo(() => albumData?.results ?? [], [albumData]);

    const onRefresh = useCallback(() => {
        refetch();
    }, [refetch]);

    const sortedAlbums = useMemo(() => {
        const copy = [...albums];
        switch (sortBy) {
            case 'name': copy.sort((a, b) => a.name.localeCompare(b.name)); break;
            case 'oldest': copy.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)); break;
            case 'newest':
            default: copy.sort((a, b) => (b.id ?? 0) - (a.id ?? 0)); break;
        }
        return copy;
    }, [albums, sortBy]);

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

    const goToCreateAlbum = () => {
        haptics.tap();
        navigation.navigate('CreateAlbum');
    };

    const sortMenuItems = (Object.keys(SORT_LABELS) as SortOption[]).map(opt => ({
        key: opt,
        label: SORT_LABELS[opt],
        icon: sortBy === opt ? <Check size={18} color={colors.primary} /> : undefined,
        onPress: () => setSortBy(opt),
    }));

    const renderGridItem = ({ item, index }: { item: Album; index: number }) => (
        <FadeInItem index={index}>
            <Pressable
                style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.9 }]}
                android_ripple={ripple}
                onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumName: item.name, coverUrl: item.cover_url })}
            >
                <View style={styles.coverContainer}>
                    {item.cover_url ? (
                        <RemoteImage uri={item.cover_url} style={styles.coverImage} />
                    ) : (
                        <View style={styles.placeholderCover}><Folder size={40} color="#ccc" /></View>
                    )}
                </View>
                <Text style={styles.albumName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.mediaCount}>{item.media_count} items</Text>
            </Pressable>
        </FadeInItem>
    );

    const renderListItem = ({ item, index }: { item: Album; index: number }) => (
        <FadeInItem index={index}>
            <Pressable
                style={({ pressed }) => [styles.albumRow, pressed && { opacity: 0.9 }]}
                android_ripple={ripple}
                onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumName: item.name, coverUrl: item.cover_url })}
            >
                <View style={styles.rowCoverContainer}>
                    {item.cover_url ? (
                        <RemoteImage uri={item.cover_url} style={styles.coverImage} />
                    ) : (
                        <View style={styles.placeholderCover}><Folder size={28} color="#ccc" /></View>
                    )}
                </View>
                <View style={styles.rowTextContainer}>
                    <Text style={styles.albumName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.mediaCount}>{item.media_count} items</Text>
                </View>
            </Pressable>
        </FadeInItem>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

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
                            placeholder="Search albums"
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
                        <Text style={styles.headerTitle}>Albums</Text>
                        <View style={styles.headerRightIcons}>
                            <Pressable onPress={openSearch} hitSlop={12} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }} style={styles.roundIconBtn}>
                                <Search size={22} color={colors.onSurface} />
                            </Pressable>
                            <Pressable onPress={goToCreateAlbum} hitSlop={12} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 22 }} style={styles.roundIconBtn}>
                                <Plus size={24} color={colors.onSurface} />
                            </Pressable>
                        </View>
                    </>
                )}
            </View>

            <View style={styles.toolRow}>
                <Pressable
                    style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.85 }]}
                    android_ripple={ripple}
                    onPress={() => setSortMenuVisible(true)}
                >
                    <ArrowUpDown size={16} color={colors.onSurfaceVariant} />
                    <Text style={styles.sortBtnText}>{SORT_LABELS[sortBy]}</Text>
                </Pressable>
                <Pressable
                    style={styles.roundIconBtn}
                    android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 20 }}
                    onPress={() => setViewMode(m => (m === 'grid' ? 'list' : 'grid'))}
                    hitSlop={10}
                >
                    {viewMode === 'grid' ? <ListIcon size={20} color={colors.onSurfaceVariant} /> : <LayoutGrid size={20} color={colors.onSurfaceVariant} />}
                </Pressable>
            </View>

            {loading ? (
                <SkeletonGrid cellSize={CELL} columns={2} rows={3} style={{ paddingTop: 12 }} />
            ) : (
                <FlatList
                    key={viewMode}
                    data={sortedAlbums}
                    numColumns={viewMode === 'grid' ? 2 : 1}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[colors.primary]}
                            progressBackgroundColor={colors.surface}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Folder size={64} color="#ccc" style={{ marginBottom: 16 }} />
                            <Text style={styles.emptyTitle}>No Albums Yet</Text>
                            <Text style={styles.emptySubtitle}>Tap the + button to create your first album</Text>
                        </View>
                    }
                />
            )}

            <BottomSheetMenu
                visible={sortMenuVisible}
                onClose={() => setSortMenuVisible(false)}
                title="Sort albums"
                items={sortMenuItems}
            />
        </View>
    );
};

export default AlbumsScreen;

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },

    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 12, backgroundColor: colors.surface },
    roundIconBtn: { padding: 10, borderRadius: radii.full },
    headerTitle: { flex: 1, fontSize: 22, fontWeight: '500', color: colors.onSurface, marginLeft: 4 },
    headerRightIcons: { flexDirection: 'row', alignItems: 'center' },

    searchPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceVariant,
        borderRadius: radii.full, paddingHorizontal: 14, height: 48, marginHorizontal: 4,
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 16, color: colors.onSurface, paddingVertical: 0 },

    toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
    sortBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12,
        borderRadius: radii.full, backgroundColor: colors.surfaceVariant,
    },
    sortBtnText: { fontSize: 13, color: colors.onSurfaceVariant, fontWeight: '500' },

    listContent: { paddingHorizontal: 16, paddingTop: 8 },

    albumCard: { width: CELL, marginBottom: 24, marginHorizontal: 8, borderRadius: radii.lg },
    coverContainer: {
        width: CELL, height: CELL, borderRadius: radii.lg, overflow: 'hidden',
        backgroundColor: colors.surfaceVariant, marginBottom: 12, ...elevation[1],
    },
    coverImage: { width: '100%', height: '100%' },
    placeholderCover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    albumName: { fontSize: 15, fontWeight: '500', color: colors.onSurface },
    mediaCount: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },

    albumRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: radii.md },
    rowCoverContainer: { width: 56, height: 56, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceVariant, marginRight: 16, ...elevation[1] },
    rowTextContainer: { flex: 1 },

    emptyState: { alignItems: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: colors.onSurfaceVariant, textAlign: 'center' },
});
