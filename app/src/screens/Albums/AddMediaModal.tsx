import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    Pressable,
    ActivityIndicator,
    SafeAreaView,
    Alert,
    ToastAndroid,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MediaGrid from '../../components/MediaGrid';
import { getMedia } from '../../api/media';
import { addMediaToAlbum, getAlbumMedia } from '../../api/albums';
import { Media } from '../../types/media';

interface Props {
    visible: boolean;
    albumId: number;
    onClose: () => void;
    onAdded: () => void;
}

const EMPTY_SET = new Set<number>();

const AddMediaModal = ({ visible, albumId, onClose, onAdded }: Props) => {
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(EMPTY_SET);
    const [existingMediaIds, setExistingMediaIds] = useState<Set<number>>(EMPTY_SET);
    const [adding, setAdding] = useState(false);

    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);

    const fetchMedia = useCallback(async (pageNumber: number) => {
        if (pageNumber > 1 && busyRef.current) { return; }
        busyRef.current = true;
        if (pageNumber === 1) { setLoading(true); } else { setLoadingMore(true); }
        try {
            const data = await getMedia({ page: pageNumber });
            setMedia(prev => {
                if (pageNumber === 1) { return data.results; }
                const existing = new Set(prev.map(m => m.id));
                return [...prev, ...data.results.filter(m => !existing.has(m.id))];
            });
            pageRef.current = pageNumber;
            hasMoreRef.current = !!data.next;
        } catch (err) {
            console.log('Failed to fetch media for selection', err);
        } finally {
            busyRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        if (!visible) { return; }
        fetchMedia(1);
        setSelectedIds(EMPTY_SET);
        setExistingMediaIds(EMPTY_SET);
        getAlbumMedia(albumId)
            .then(data => setExistingMediaIds(new Set(data.media.map(m => m.id))))
            .catch(err => console.log('Failed to fetch existing media', err));
    }, [visible, albumId, fetchMedia]);

    const onEndReached = useCallback(() => {
        if (hasMoreRef.current) {
            fetchMedia(pageRef.current + 1);
        }
    }, [fetchMedia]);

    const handleAdd = async () => {
        if (selectedIds.size === 0) { return; }
        setAdding(true);
        try {
            await addMediaToAlbum(albumId, Array.from(selectedIds));
            ToastAndroid.show(`${selectedIds.size} items added to album`, ToastAndroid.SHORT);
            onAdded();
            onClose();
        } catch {
            Alert.alert('Error', 'Failed to add media to album');
        } finally {
            setAdding(false);
        }
    };

    const toggleSelection = useCallback((item: Media) => {
        if (existingMediaIds.has(item.id)) { return; }
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); }
            return next;
        });
    }, [existingMediaIds]);

    const toggleDateGroup = useCallback((mediaIds: number[]) => {
        const selectableIds = mediaIds.filter(id => !existingMediaIds.has(id));
        if (selectableIds.length === 0) { return; }
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = selectableIds.every(id => next.has(id));
            selectableIds.forEach(id => (allSelected ? next.delete(id) : next.add(id)));
            return next;
        });
    }, [existingMediaIds]);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <GestureHandlerRootView style={styles.container}>
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Select Media</Text>
                        <Pressable onPress={onClose} disabled={adding} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>Cancel</Text>
                        </Pressable>
                    </View>

                    <View style={styles.gridContainer}>
                        <MediaGrid
                            media={media}
                            selectionMode
                            selectedIds={selectedIds}
                            disabledIds={existingMediaIds}
                            onPressItem={toggleSelection}
                            onLongPressItem={toggleSelection}
                            onToggleGroup={toggleDateGroup}
                            showFavoriteBadge={false}
                            loading={loading}
                            onEndReached={onEndReached}
                            loadingMore={loadingMore}
                            bottomPadding={16}
                        />
                    </View>

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
            </GestureHandlerRootView>
        </Modal>
    );
};

export default AddMediaModal;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    closeBtn: { padding: 8 },
    closeBtnText: { fontSize: 16, color: '#1a73e8' },
    gridContainer: { flex: 1 },
    footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
    addBtn: { backgroundColor: '#1a73e8', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
    addBtnDisabled: { backgroundColor: '#8ab4f8' },
    addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
