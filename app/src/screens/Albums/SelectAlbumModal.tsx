import React, { useEffect, useState } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    FlatList,
    Pressable,
    ActivityIndicator,
    Dimensions,
    SafeAreaView,
    Alert,
    ToastAndroid,
} from 'react-native';
import { Folder } from 'lucide-react-native';
import { getAlbums, addMediaToAlbum } from '../../api/albums';
import { Album } from '../../types/album';
import AuthenticatedImage from '../../components/AuthenticatedImage';

const { width } = Dimensions.get('window');
const CELL = (width - 48) / 2;

interface Props {
    visible: boolean;
    mediaId: number | null;
    onClose: () => void;
}

const SelectAlbumModal = ({ visible, mediaId, onClose }: Props) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchAlbums();
        }
    }, [visible]);

    const fetchAlbums = async () => {
        setLoading(true);
        try {
            // Fetch first page, ideally we'd fetch all or paginate here if many albums
            const data = await getAlbums(1);
            setAlbums(data.results);
        } catch (err) {
            console.log('Failed to fetch albums for selection', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAlbum = async (album: Album) => {
        if (!mediaId) return;
        setAdding(true);
        try {
            await addMediaToAlbum(album.id, [mediaId]);
            ToastAndroid.show(`Added to ${album.name}`, ToastAndroid.SHORT);
            onClose();
        } catch (err) {
            Alert.alert('Error', 'Failed to add media to album');
        } finally {
            setAdding(false);
        }
    };

    const renderItem = ({ item }: { item: Album }) => (
        <Pressable
            style={styles.albumCard}
            onPress={() => handleSelectAlbum(item)}
            disabled={adding}
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
        </Pressable>
    );

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Select Album</Text>
                    <Pressable onPress={onClose} disabled={adding} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>Cancel</Text>
                    </Pressable>
                </View>

                {loading ? (
                    <ActivityIndicator style={styles.loader} size="large" color="#007AFF" />
                ) : (
                    <FlatList
                        data={albums}
                        numColumns={2}
                        keyExtractor={item => item.id.toString()}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No albums found</Text>
                            </View>
                        }
                    />
                )}
                
                {adding && (
                    <View style={styles.addingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                    </View>
                )}
            </SafeAreaView>
        </Modal>
    );
};

export default SelectAlbumModal;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    closeBtn: { padding: 8 },
    closeBtnText: { fontSize: 16, color: '#007AFF' },
    loader: { marginTop: 40 },
    listContent: { padding: 16 },
    albumCard: { width: CELL, marginBottom: 24, marginHorizontal: 8 },
    coverContainer: { width: CELL, height: CELL, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f0f0f0', marginBottom: 8 },
    coverImage: { width: '100%', height: '100%' },
    placeholderCover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    albumName: { fontSize: 16, fontWeight: '600', color: '#111' },
    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: '#888', fontSize: 16 },
    addingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
});
