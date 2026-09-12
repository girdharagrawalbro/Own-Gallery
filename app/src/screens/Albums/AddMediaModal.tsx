import React, { useEffect, useState, useCallback } from 'react';
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
import { ImageOff, Check } from 'lucide-react-native';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import VideoThumbnail from '../../components/VideoThumbnail';
import { getMedia } from '../../api/media';
import { addMediaToAlbum, getAlbumMedia } from '../../api/albums';
import { Media } from '../../types/media';

type ListItem =
    | { type: 'header'; title: string; id: string; mediaIds: number[] }
    | { type: 'row'; items: Media[]; id: string };

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

interface Props {
    visible: boolean;
    albumId: number;
    onClose: () => void;
    onAdded: () => void;
}

const AddMediaModal = ({ visible, albumId, onClose, onAdded }: Props) => {
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [existingMediaIds, setExistingMediaIds] = useState<Set<number>>(new Set());
    const [adding, setAdding] = useState(false);

    const fetchMedia = async (pageNumber: number) => {
        if (pageNumber === 1) setLoading(true);
        try {
            const data = await getMedia(pageNumber);
            if (pageNumber === 1) {
                setMedia(data.results);
            } else {
                setMedia(prev => [...prev, ...data.results]);
            }
            setPage(pageNumber);
            setHasMore(!!data.next);
        } catch (err) {
            console.log('Failed to fetch media for selection', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (visible) {
            fetchMedia(1);
            setSelectedIds(new Set());
            setExistingMediaIds(new Set());
            getAlbumMedia(albumId).then(data => {
                setExistingMediaIds(new Set(data.media.map(m => m.id)));
            }).catch(err => console.log('Failed to fetch existing media', err));
        }
    }, [visible, albumId]);

    const handleAdd = async () => {
        if (selectedIds.size === 0) return;
        setAdding(true);
        try {
            await addMediaToAlbum(albumId, Array.from(selectedIds));
            ToastAndroid.show(`${selectedIds.size} items added to album`, ToastAndroid.SHORT);
            onAdded();
            onClose();
        } catch (err) {
            Alert.alert('Error', 'Failed to add media to album');
        } finally {
            setAdding(false);
        }
    };

    const toggleSelection = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const toggleDateGroup = useCallback((mediaIds: number[]) => {
        const selectableIds = mediaIds.filter(id => !existingMediaIds.has(id));
        if (selectableIds.length === 0) return;

        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = selectableIds.every(id => next.has(id));
            if (allSelected) {
                selectableIds.forEach(id => next.delete(id));
            } else {
                selectableIds.forEach(id => next.add(id));
            }
            return next;
        });
    }, [existingMediaIds]);

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
            // Chunk into rows of 3
            for (let i = 0; i < items.length; i += 3) {
                const chunk = items.slice(i, i + 3);
                result.push({ type: 'row', items: chunk, id: `row-${chunk[0].id}` });
            }
        }
        return result;
    }, [media]);

    const renderItem = useCallback(({ item }: { item: ListItem }) => {
        if (item.type === 'header') {
            const selectableIds = item.mediaIds.filter(id => !existingMediaIds.has(id));
            const isAllSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
            return (
                <View style={styles.dateHeaderContainer}>
                    <Text style={styles.dateHeaderText}>{item.title}</Text>
                    {selectableIds.length > 0 && (
                        <Pressable onPress={() => toggleDateGroup(item.mediaIds)} style={styles.dateGroupSelectBtn}>
                            <View style={[styles.dateGroupCheckBadge, isAllSelected && styles.dateGroupCheckBadgeActive]}>
                                {isAllSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                            </View>
                        </Pressable>
                    )}
                </View>
            );
        }

        return (
            <View style={styles.row}>
                {item.items.map(mediaItem => {
                    const isSelected = selectedIds.has(mediaItem.id);
                    const isExisting = existingMediaIds.has(mediaItem.id);
                    return (
                        <Pressable
                            key={mediaItem.id}
                            style={styles.cell}
                            onPress={() => {
                                if (!isExisting) toggleSelection(mediaItem.id);
                            }}
                        >
                            {mediaItem.media_type === 'video' ? (
                                <VideoThumbnail thumbnailUrl={mediaItem.thumbnail_url} duration={mediaItem.duration} />
                            ) : mediaItem.thumbnail_url ? (
                                <AuthenticatedImage uri={mediaItem.thumbnail_url} style={styles.cellImage} resizeMode="cover" />
                            ) : (
                                <View style={styles.noThumb}><ImageOff size={24} color="#ccc" /></View>
                            )}

                            {isExisting ? (
                                <View style={styles.overlay}>
                                    <View style={[styles.checkBadge, { backgroundColor: '#8e8e93', borderColor: '#8e8e93' }]}>
                                        <Check size={14} color="#fff" />
                                    </View>
                                </View>
                            ) : isSelected && (
                                <View style={styles.overlay}>
                                    <View style={styles.checkBadge}>
                                        <Check size={14} color="#fff" />
                                    </View>
                                </View>
                            )}
                        </Pressable>
                    );
                })}
            </View>
        );
    }, [selectedIds, toggleDateGroup, existingMediaIds]);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Select Media</Text>
                    <Pressable onPress={onClose} disabled={adding} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>Cancel</Text>
                    </Pressable>
                </View>

                {loading && page === 1 ? (
                    <ActivityIndicator style={styles.loader} size="large" />
                ) : (
                    <FlatList
                        data={listData}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        onEndReached={() => {
                            if (hasMore && !loading) {
                                fetchMedia(page + 1);
                            }
                        }}
                        onEndReachedThreshold={0.5}
                    />
                )}

                <View style={styles.footer}>
                    <Pressable
                        style={[styles.addBtn, (adding || selectedIds.size === 0) && styles.addBtnDisabled]}
                        onPress={handleAdd}
                        disabled={adding || selectedIds.size === 0}
                    >
                        {adding ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.addBtnText}>
                                Add {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Items
                            </Text>
                        )}
                    </Pressable>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

export default AddMediaModal;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    closeBtn: { padding: 8 },
    closeBtnText: { fontSize: 16, color: '#007AFF' },
    loader: { marginTop: 40 },
    dateHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
    dateHeaderText: { fontSize: 16, fontWeight: 'bold', color: '#111' },
    dateGroupSelectBtn: { padding: 4 },
    dateGroupCheckBadge: { width: 20, height: 20, borderRadius: 11, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
    dateGroupCheckBadgeActive: { backgroundColor: '#007AFF', borderWidth: 0 },
    row: { flexDirection: 'row', width: '100%' },
    cell: { position: 'relative', width: CELL, height: CELL, margin: 0.5, backgroundColor: '#eee' },
    cellImage: { width: '100%', height: '100%' },
    noThumb: { flex: 1, backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
    noThumbIcon: { fontSize: 24 }, // Keeping just in case
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255, 255, 255, 0.4)', borderWidth: 2, borderColor: '#007AFF' },
    checkBadge: { position: 'absolute', bottom: 8, right: 8, width: 20, height: 20, borderRadius: 12, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
    footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
    addBtn: { backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
    addBtnDisabled: { backgroundColor: '#99ccff' },
    addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
