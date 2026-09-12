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
    TouchableOpacity,
    View,
    ToastAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageOff, Trash2 } from 'lucide-react-native';

import AuthenticatedImage from '../../components/AuthenticatedImage';
import VideoThumbnail from '../../components/VideoThumbnail';
import { getTrashMedia, restoreFromTrash, permanentDelete, emptyTrash } from '../../api/media';
import { Media } from '../../types/media';

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

const TrashScreen = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchTrash = async () => {
        try {
            const data = await getTrashMedia();
            setMedia(data);
        } catch (err) {
            console.log('Failed to fetch trash', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchTrash();
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTrash();
    }, []);

    const handleEmptyTrash = () => {
        if (media.length === 0) return;

        Alert.alert(
            'Empty Trash',
            'Are you sure you want to permanently delete all items? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Empty Trash',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await emptyTrash();
                            ToastAndroid.show('Trash emptied', ToastAndroid.SHORT);
                            fetchTrash();
                        } catch (err) {
                            Alert.alert('Error', 'Failed to empty trash');
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleItemOptions = (item: Media) => {
        Alert.alert(
            'Trash Options',
            'What would you like to do with this item?',
            [
                {
                    text: 'Restore',
                    onPress: async () => {
                        try {
                            await restoreFromTrash(item.id);
                            ToastAndroid.show('Item restored', ToastAndroid.SHORT);
                            fetchTrash();
                        } catch (err) {
                            Alert.alert('Error', 'Failed to restore item');
                        }
                    }
                },
                {
                    text: 'Delete Permanently',
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert('Confirm Delete', 'Permanently delete this item?', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Delete', style: 'destructive', onPress: async () => {
                                    try {
                                        await permanentDelete(item.id);
                                        ToastAndroid.show('Item permanently deleted', ToastAndroid.SHORT);
                                        fetchTrash();
                                    } catch (err) {
                                        Alert.alert('Error', 'Failed to delete item');
                                    }
                                }
                            }
                        ]);
                    }
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    };

    const renderItem = useCallback(({ item }: { item: Media }) => (
        <Pressable
            style={styles.cell}
            onPress={() => handleItemOptions(item)}
            android_ripple={{ color: 'rgba(255,255,255,0.3)' }}>
            {item.media_type === 'video' ? (
                <VideoThumbnail thumbnailUrl={item.thumbnail_url} duration={item.duration} />
            ) : item.thumbnail_url ? (
                <AuthenticatedImage uri={item.thumbnail_url} style={styles.cellImage} resizeMode="cover" />
            ) : (
                <View style={styles.noThumb}><ImageOff size={24} color="#ccc" /></View>
            )}

            <View style={styles.trashOverlay}>
                <Text style={styles.trashOverlayText}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Deleted'}</Text>
            </View>
        </Pressable>
    ), []);

    const keyExtractor = useCallback((item: Media) => item.id.toString(), []);

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#1a73e8" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <View>
                    <Text style={styles.heading}>Trash</Text>
                    <Text style={styles.subheading}>{media.length} items</Text>
                </View>
                <TouchableOpacity onPress={handleEmptyTrash} disabled={media.length === 0}>
                    <Text style={[styles.emptyBtnText, media.length === 0 && styles.emptyBtnDisabled]}>Empty</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={media}
                numColumns={3}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a73e8" />}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Trash2 size={64} color="#ccc" style={{ marginBottom: 16 }} />
                        <Text style={styles.emptyTitle}>Trash is empty</Text>
                    </View>
                }
                getItemLayout={(_, index) => ({
                    length: CELL,
                    offset: CELL * Math.floor(index / 3),
                    index,
                })}
            />
        </View>
    );
};

export default TrashScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 16, 
        paddingBottom: 16, 
        backgroundColor: '#fff',
    },
    heading: { fontSize: 28, fontWeight: '700', color: '#3c4043', letterSpacing: -0.5 },
    subheading: { fontSize: 13, color: '#5f6368', marginTop: 2 },
    emptyBtnText: { color: '#1a73e8', fontSize: 16, fontWeight: '600' },
    emptyBtnDisabled: { color: '#8ab4f8' },
    
    cell: { width: CELL, height: CELL, margin: 0.5, backgroundColor: '#f1f3f4', overflow: 'hidden' },
    cellImage: { width: '100%', height: '100%' },
    noThumb: { flex: 1, backgroundColor: '#f1f3f4', justifyContent: 'center', alignItems: 'center' },
    
    trashOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 4 },
    trashOverlayText: { color: '#fff', fontSize: 10, textAlign: 'center' },
    
    emptyState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#3c4043', marginBottom: 8 },
});
