import React, { useCallback, useEffect, useState } from 'react';
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
    Modal,
    ToastAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Folder, Plus, Info, Search } from 'lucide-react-native';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import { getAlbums, createAlbum, deleteAlbum, updateAlbum } from '../../api/albums';
import { Album } from '../../types/album';

const { width } = Dimensions.get('window');
const CELL = (width - 48) / 2; // 2 columns with some padding

const AlbumsScreen = () => {
    const navigation = useNavigation<any>();
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [newAlbumName, setNewAlbumName] = useState('');
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [renameAlbumId, setRenameAlbumId] = useState<number | null>(null);
    const [renameAlbumName, setRenameAlbumName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchAlbumsList = async () => {
        try {
            const data = await getAlbums(1, searchQuery);
            setAlbums(data.results);
        } catch (err) {
            console.log('Failed to fetch albums', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchAlbumsList();
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAlbumsList();
    }, [searchQuery]);

    const handleCreateAlbum = async () => {
        if (!newAlbumName.trim()) return;
        try {
            await createAlbum(newAlbumName);
            ToastAndroid.show('Album created', ToastAndroid.SHORT);
            setCreateModalVisible(false);
            setNewAlbumName('');
            onRefresh();
        } catch (err) {
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
        } catch (err) {
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
                    <AuthenticatedImage uri={item.cover_url} style={styles.coverImage} resizeMode="cover" />
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
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.heading}>Albums</Text>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={20} color="#888" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search albums..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor="#888"
                    />
                </View>
            </View>

            <FlatList
                data={albums}
                numColumns={2}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Folder size={64} color="#ccc" style={{ marginBottom: 16 }} />
                        <Text style={styles.emptyTitle}>No Albums Yet</Text>
                        <Text style={styles.emptySubtitle}>Tap the + button to create your first album</Text>
                    </View>
                }
            />

            <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}>
                <Plus size={32} color="#fff" />
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
                        />
                        <View style={styles.modalActions}>
                            <Pressable style={styles.modalBtn} onPress={() => setCreateModalVisible(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={styles.modalBtn} onPress={handleCreateAlbum}>
                                <Text style={[styles.modalBtnText, { color: '#007AFF', fontWeight: 'bold' }]}>Create</Text>
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
                                <Text style={[styles.modalBtnText, { color: '#007AFF', fontWeight: 'bold' }]}>Save</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default AlbumsScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
    heading: { fontSize: 28, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
    searchContainer: { paddingHorizontal: 16, paddingBottom: 12 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12 },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, height: 40, fontSize: 16, color: '#333' },
    listContent: { padding: 16 },
    albumCard: { width: CELL, marginBottom: 24, marginHorizontal: 8 },
    coverContainer: { width: CELL, height: CELL, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f0f0f0', marginBottom: 8 },
    coverImage: { width: '100%', height: '100%' },
    placeholderCover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderIcon: { fontSize: 40 }, // Keeping just in case
    albumName: { fontSize: 16, fontWeight: '600', color: '#111' },
    mediaCount: { fontSize: 13, color: '#888', marginTop: 2 },
    fab: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
    fabText: { color: '#fff', fontSize: 22, fontWeight: '400', marginTop: -2 },
    emptyState: { alignItems: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 12, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20 },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
    modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    modalBtnText: { fontSize: 16, color: '#555' },
});
