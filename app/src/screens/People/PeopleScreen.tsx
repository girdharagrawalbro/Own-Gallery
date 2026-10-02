import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Search, Users, X, ScanFace } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPeople, scanFaces } from '../../api/people';
import { Person } from '../../types/people';


const { width } = Dimensions.get('window');
const COLS = 3;
const AVATAR = (width - 32 - (COLS - 1) * 16) / COLS;

// Circular face avatar that crops to the bounding box
const FaceAvatar = ({
    thumbnailUrl,
    coverFace,
    size,
}: {
    thumbnailUrl: string | null;
    coverFace: Person['cover_face'];
    size: number;
}) => {
    if (!thumbnailUrl) {
        return (
            <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]}>
                <Users size={size * 0.4} color="#999" />
            </View>
        );
    }

    if (!coverFace) {
        return (
            <Image
                source={{ uri: thumbnailUrl }}
                style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
            />
        );
    }

    // Crop to the face bounding box
    const { box_top, box_right, box_bottom, box_left } = coverFace;
    const faceW = box_right - box_left;
    const faceH = box_bottom - box_top;
    const scale = 1 / Math.max(faceW, faceH);
    const imgSize = size * scale;
    const offsetX = -box_left * imgSize;
    const offsetY = -box_top * imgSize;

    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
            <Image
                source={{ uri: thumbnailUrl }}
                style={{
                    width: imgSize,
                    height: imgSize,
                    marginLeft: offsetX,
                    marginTop: offsetY,
                }}
            />
        </View>
    );
};

// Staggered fade-in for grid items
const FadeInItem = ({ index, children }: { index: number; children: React.ReactNode }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            delay: Math.min(index, 12) * 25,
            useNativeDriver: true,
        }).start();
    }, []);
    return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};

const PeopleScreen = () => {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const queryClient = useQueryClient();
    const scanMutation = useMutation({
        mutationFn: () => scanFaces(),
        onSuccess: (data) => {
            Alert.alert(
                'Face Scan Started',
                data.message || 'Face detection has been queued. People will appear as photos are processed.',
            );
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['people'] });
            }, 5000);
        },
        onError: (err: any) => {
            Alert.alert(
                'Scan Failed',
                err?.response?.data?.message || err?.message || 'Could not start face scan.',
            );
        },
    });

    const {
        data: peopleData,
        isLoading: loading,
        isRefetching: refreshing,
        refetch,
    } = useQuery<Person[]>({
        queryKey: ['people'],
        queryFn: () => getPeople(),
    });

    const people = peopleData ?? [];

    const onRefresh = useCallback(() => {
        refetch();
    }, [refetch]);

    const filtered = searchQuery.trim()
        ? people.filter(p =>
            p.display_name.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : people;

    const renderItem = ({ item, index }: { item: Person; index: number }) => (
        <FadeInItem index={index}>
            <Pressable
                style={({ pressed }) => [styles.personCell, pressed && { opacity: 0.85 }]}
                onPress={() => navigation.navigate('PersonDetail', { personId: item.id, personName: item.display_name })}
            >
                <View style={styles.avatarWrapper}>
                    <FaceAvatar
                        thumbnailUrl={item.cover_thumbnail_url}
                        coverFace={item.cover_face}
                        size={AVATAR}
                    />
                </View>
                <Text style={styles.personName} numberOfLines={1}>
                    {item.display_name}
                </Text>
                <Text style={styles.mediaCount}>{item.media_count} photos</Text>
            </Pressable>
        </FadeInItem>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                {searchVisible ? (
                    <View style={styles.searchPill}>
                        <Search size={18} color="#888" style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search people"
                            placeholderTextColor="#999"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                        <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }} hitSlop={10}>
                            <X size={18} color="#888" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
                            <ArrowLeft size={24} color="#3c4043" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>People & Pets</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity
                                onPress={() => scanMutation.mutate()}
                                disabled={scanMutation.isPending}
                                hitSlop={12}
                                style={styles.iconBtn}
                                accessibilityLabel="Scan photos for faces"
                            >
                                {scanMutation.isPending ? (
                                    <ActivityIndicator size="small" color="#1a73e8" />
                                ) : (
                                    <ScanFace size={22} color="#3c4043" />
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setSearchVisible(true)} hitSlop={12} style={styles.iconBtn}>
                                <Search size={22} color="#3c4043" />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1a73e8" />
                </View>
            ) : filtered.length === 0 ? (
                <View style={styles.center}>
                    <Users size={64} color="#ddd" />
                    <Text style={styles.emptyTitle}>
                        {searchQuery ? 'No matches' : 'No people found'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                        {searchQuery
                            ? 'Try a different name'
                            : 'Face grouping runs in the background after you upload photos.'}
                    </Text>
                    {!searchQuery && (
                        <TouchableOpacity
                            style={styles.scanBtn}
                            onPress={() => scanMutation.mutate()}
                            disabled={scanMutation.isPending}
                        >
                            {scanMutation.isPending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <ScanFace size={18} color="#fff" style={{ marginRight: 8 }} />
                            )}
                            <Text style={styles.scanBtnText}>
                                {scanMutation.isPending ? 'Starting scan...' : 'Scan photos for faces'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    numColumns={COLS}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1a73e8']} />}
                />
            )}
        </View>
    );

};

export default PeopleScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingBottom: 12,
        backgroundColor: '#fff',
    },
    iconBtn: { padding: 10, borderRadius: 22 },
    headerTitle: { flex: 1, fontSize: 22, fontWeight: '500', color: '#1c1b1f', marginLeft: 4 },

    searchPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f3f4',
        borderRadius: 24,
        paddingHorizontal: 14,
        height: 46,
        marginHorizontal: 4,
    },
    searchInput: { flex: 1, fontSize: 16, color: '#222', paddingVertical: 0 },

    listContent: { paddingHorizontal: 16, paddingTop: 8 },

    personCell: {
        width: AVATAR,
        alignItems: 'center',
        marginBottom: 20,
        marginRight: 16,
    },
    avatarWrapper: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
        borderRadius: AVATAR / 2,
        backgroundColor: '#fff',
        marginBottom: 8,
    },
    avatar: { resizeMode: 'cover' },
    avatarPlaceholder: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    personName: { fontSize: 13, fontWeight: '500', color: '#1c1b1f', textAlign: 'center' },
    mediaCount: { fontSize: 12, color: '#777', marginTop: 2, textAlign: 'center' },

    emptyTitle: { fontSize: 18, fontWeight: '600', color: '#3c4043', marginTop: 16, textAlign: 'center' },
    emptySubtitle: { fontSize: 14, color: '#777', marginTop: 8, textAlign: 'center', lineHeight: 20 },
    scanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a73e8',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 20,
        marginTop: 20,
    },
    scanBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
});

