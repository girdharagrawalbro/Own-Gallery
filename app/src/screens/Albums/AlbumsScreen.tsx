import React, { useCallback, useEffect, useState } from 'react';
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
    Modal,
    ToastAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Folder, Plus, Search } from 'lucide-react-native';
import RemoteImage from '../../components/RemoteImage';
import { getAlbums, createAlbum, deleteAlbum, updateAlbum } from '../../api/albums';
import { Album } from '../../types/album';

const { width } = Dimensions.get('window');
const CELL = (width - 48) / 2; // 2 columns with some padding

const AlbumsScreen = () => {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [newAlbumName, setNewAlbumName] = useState('');
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [renameAlbumId, setRenameAlbumId] = useState<number | null>(null);
    const [renameAlbumName, setRenameAlbumName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchAlbumsList = useCallback(async () => {
        try {
            const data = await getAlbums(1, searchQuery);
            setAlbums(data.results);
        } catch (err) {
            console.log('Failed to fetch albums', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchAlbumsList();
        }, 300);
        return () => clearTimeout(timeout);
    }, [fetchAlbumsList]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAlbumsList();
    }, [fetchAlbumsList]);

    const handleCreateAlbum = async () => {
        if (!newAlbumName.trim()) return;
        try {
            await createAlbum(newAlbumName);
            ToastAndroid.show('Album created', ToastAndroid.SHORT);
            setCreateModalVisible(false);
            setNewAlbumName('');
            onRefresh();
        } catch {
            Alert.alert('Error', 'Failed to create album');
        }
    };

    const handleRenameAlbum = async () => {
        if (!renameAlbumName.trim() || !renameAlbumId) return;
        try {
            await updateAlbum(renameAlbumId, { name: renameAlbumName });
            ToastAndroid.show('Album renamed', ToastAndroid.SHORT);
            setRenameModalVisible(false);
            setRenameAlbumId(null);
            setRenameAlbumName('');
            onRefresh();
        } catch {
            Alert.alert('Error', 'Failed to rename album');
        }
    };

    const handleAlbumLongPress = (album: Album) => {
        Alert.alert(
            'Album Options',
            album.name,
            [
                {
                    text: 'Rename',
                    onPress: () => {
                        setRenameAlbumId(album.id);
                        setRenameAlbumName(album.name);
                        setRenameModalVisible(true);
                    }
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert('Confirm Delete', `Are you sure you want to delete ${album.name}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Delete', style: 'destructive', onPress: async () => {
                                    await deleteAlbum(album.id);
                                    ToastAndroid.show('Album deleted', ToastAndroid.SHORT);
                                    onRefresh();
                                }
                            }
                        ]);
                    }
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    };

    const renderItem = ({ item }: { item: Album }) => (
        <Pressable
            style={styles.albumCard}
            onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumName: item.name })}
            onLongPress={() => handleAlbumLongPress(item)}
        >
            <View style={styles.coverContainer}>
                {item.cover_url ? (
                    <RemoteImage uri={item.cover_url} style={styles.coverImage} />
                ) : (
                    <View style={styles.placeholderCover}>
                        <Folder size={40} color="#ccc" />
                    </View>
                )}
            </View>
            <Text style={styles.albumName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.mediaCount}>{item.media_count} items</Text>
        </Pressable>
    );

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#1a73e8" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Search Pill Header */}
            <View style={[styles.searchContainer, { paddingTop: Math.max(insets.top, 16) }]}>
                <View style={styles.searchPill}>
                    <Search size={20} color="#777" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search albums"
                        placeholderTextColor="#777"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                    />
                </View>
            </View>

            <FlatList
                data={albums}
                numColumns={2}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Folder size={64} color="#ccc" style={{ marginBottom: 16 }} />
                        <Text style={styles.emptyTitle}>No Albums Yet</Text>
                        <Text style={styles.emptySubtitle}>Tap the + button to create your first album</Text>
                    </View>
                }
            />

            <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom + 16, 16) }]} onPress={() => setCreateModalVisible(true)}>
                <Plus size={28} color="#fff" />
            </TouchableOpacity>

            <Modal visible={createModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>New Album</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Album Name"
                            value={newAlbumName}
                            onChangeText={setNewAlbumName}
                            autoFocus
                            placeholderTextColor={'#777'}
                        />
                        <View style={styles.modalActions}>
                            <Pressable style={styles.modalBtn} onPress={() => setCreateModalVisible(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={styles.modalBtn} onPress={handleCreateAlbum}>
                                <Text style={[styles.modalBtnText, { color: '#1a73e8', fontWeight: 'bold' }]}>Create</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={renameModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Rename Album</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Album Name"
                            value={renameAlbumName}
                            onChangeText={setRenameAlbumName}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <Pressable style={styles.modalBtn} onPress={() => setRenameModalVisible(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={styles.modalBtn} onPress={handleRenameAlbum}>
                                <Text style={[styles.modalBtnText, { color: '#1a73e8', fontWeight: 'bold' }]}>Save</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default AlbumsScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
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
        paddingVertical: 0,
    },

    listContent: { paddingHorizontal: 16, paddingTop: 8 },
    albumCard: { width: CELL, marginBottom: 24, marginHorizontal: 8 },
    coverContainer: { width: CELL, height: CELL, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f1f3f4', marginBottom: 12 },
    coverImage: { width: '100%', height: '100%' },
    placeholderCover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    albumName: { fontSize: 16, fontWeight: '500', color: '#3c4043' },
    mediaCount: { fontSize: 13, color: '#5f6368', marginTop: 4 },

    fab: {
        position: 'absolute',
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#1a73e8', // Google Blue
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5
    },

    emptyState: { alignItems: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#3c4043', marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: '#5f6368', textAlign: 'center' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#3c4043' },
    input: { borderWidth: 1, borderColor: '#dadce0', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 24, color: '#222' },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f3f4', paddingTop: 16 },
    modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    modalBtnText: { fontSize: 16, color: '#5f6368', fontWeight: '500' },
});
