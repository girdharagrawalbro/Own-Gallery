
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Modal,
    SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Users, Image as ImageIcon, X } from 'lucide-react-native';
import RemoteImage from '../../components/RemoteImage';
import { createAlbum, addMediaToAlbum } from '../../api/albums';
import { getMedia } from '../../api/media';
import { Media } from '../../types/media';

const { width } = Dimensions.get('window');
const THUMB = (width - 48 - 24) / 4; // 4-up preview grid

const CreateAlbumScreen = () => {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [title, setTitle] = useState('');
    const [selectedMedia, setSelectedMedia] = useState<Media[]>([]);
    const [saving, setSaving] = useState(false);
    const [photoPickerVisible, setPhotoPickerVisible] = useState(false);

    const canSave = title.trim().length > 0 || selectedMedia.length > 0;

    const handleSelectPeopleAndPets = () => {
        // Navigate to People tab so the user can browse grouped faces.
        // In a future iteration pass a callback via route params to receive selected media.
        navigation.navigate('PeopleTab');
    };


    const handleRemoveSelected = (id: number) => {
        setSelectedMedia(prev => prev.filter(m => m.id !== id));
    };

    const handleSave = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            const name = title.trim() || 'Untitled Album';
            const newAlbum = await createAlbum(name);
            if (selectedMedia.length > 0) {
                await addMediaToAlbum(newAlbum.id, selectedMedia.map(m => m.id));
            }
            navigation.replace('AlbumDetail', {
                albumId: newAlbum.id,
                albumName: newAlbum.name,
                coverUrl: newAlbum.cover_url,
            });
        } catch (err) {
            console.error('Failed to create album', err);
            Alert.alert('Error', 'Failed to create album');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerIconBtn}>
                    <ArrowLeft size={24} color="#3c4043" />
                </TouchableOpacity>
                {canSave && (
                    <TouchableOpacity onPress={handleSave} hitSlop={12} style={styles.headerIconBtn} disabled={saving}>
                        {saving ? <ActivityIndicator size="small" color="#1a73e8" /> : <Check size={24} color="#1a73e8" />}
                    </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
            </View>

            <View style={styles.body}>
                <TextInput
                    style={styles.titleInput}
                    placeholder="Add a title"
                    placeholderTextColor="#9aa0a6"
                    value={title}
                    onChangeText={setTitle}
                    autoFocus
                    multiline
                />

                <View style={styles.optionsRow}>
                    <TouchableOpacity style={styles.optionBtn} onPress={handleSelectPeopleAndPets}>
                        <View style={styles.optionIconCircle}>
                            <Users size={22} color="#1a73e8" />
                        </View>
                        <Text style={styles.optionLabel}>Select people & pets</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionBtn} onPress={() => setPhotoPickerVisible(true)}>
                        <View style={styles.optionIconCircle}>
                            <ImageIcon size={22} color="#1a73e8" />
                        </View>
                        <Text style={styles.optionLabel}>Select photos</Text>
                    </TouchableOpacity>
                </View>

                {selectedMedia.length > 0 && (
                    <>
                        <Text style={styles.selectedHeading}>{selectedMedia.length} selected</Text>
                        <FlatList
                            data={selectedMedia}
                            keyExtractor={(item) => item.id.toString()}
                            numColumns={4}
                            contentContainerStyle={{ paddingTop: 8 }}
                            renderItem={({ item }) => (
                                <View style={styles.previewCell}>
                                    <RemoteImage uri={item.thumbnail_url} style={styles.previewImage} />
                                    <TouchableOpacity
                                        style={styles.previewRemoveBtn}
                                        onPress={() => handleRemoveSelected(item.id)}
                                        hitSlop={8}
                                    >
                                        <X size={14} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </>
                )}
            </View>

            <PhotoPickerModal
                visible={photoPickerVisible}
                initiallySelected={selectedMedia}
                onClose={() => setPhotoPickerVisible(false)}
                onConfirm={(items) => {
                    setSelectedMedia(items);
                    setPhotoPickerVisible(false);
                }}
            />
        </View>
    );
};

export default CreateAlbumScreen;

// ── Inline "select photos" picker (album doesn't exist yet, so nothing is pre-added) ──────

const PhotoPickerModal = ({
    visible,
    initiallySelected,
    onClose,
    onConfirm,
}: {
    visible: boolean;
    initiallySelected: Media[];
    onClose: () => void;
    onConfirm: (items: Media[]) => void;
}) => {
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected] = useState<Map<number, Media>>(new Map());
    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);

    const fetchPage = useCallback(async (pageNumber: number) => {
        if (pageNumber > 1 && busyRef.current) return;
        busyRef.current = true;
        if (pageNumber === 1) setLoading(true); else setLoadingMore(true);
        try {
            const data = await getMedia({ page: pageNumber });
            setMedia(prev => (pageNumber === 1 ? data.results : [...prev, ...data.results]));
            pageRef.current = pageNumber;
            hasMoreRef.current = !!data.next;
        } catch (err) {
            console.error('Failed to fetch media', err);
        } finally {
            busyRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        if (!visible) return;
        fetchPage(1);
        setSelected(new Map(initiallySelected.map(m => [m.id, m])));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const toggle = (item: Media) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item);
            return next;
        });
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.pickerHeader}>
                    <Text style={styles.pickerTitle}>Select Photos</Text>
                    <Pressable onPress={onClose} style={styles.headerIconBtn}>
                        <Text style={{ color: '#1a73e8', fontSize: 16 }}>Cancel</Text>
                    </Pressable>
                </View>
                {loading ? (
                    <View style={styles.centerFill}><ActivityIndicator size="large" color="#1a73e8" /></View>
                ) : (
                    <FlatList
                        data={media}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={3}
                        onEndReached={() => hasMoreRef.current && fetchPage(pageRef.current + 1)}
                        onEndReachedThreshold={0.4}
                        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : null}
                        renderItem={({ item }) => {
                            const isSelected = selected.has(item.id);
                            return (
                                <Pressable style={styles.gridCell} onPress={() => toggle(item)}>
                                    <RemoteImage uri={item.thumbnail_url} style={styles.gridImage} />
                                    <View style={[styles.selectDot, isSelected && styles.selectDotActive]}>
                                        {isSelected && <Check size={14} color="#fff" />}
                                    </View>
                                </Pressable>
                            );
                        }}
                    />
                )}
                <View style={styles.pickerFooter}>
                    <TouchableOpacity
                        style={[styles.confirmBtn, selected.size === 0 && styles.confirmBtnDisabled]}
                        disabled={selected.size === 0}
                        onPress={() => onConfirm(Array.from(selected.values()))}
                    >
                        <Text style={styles.confirmBtnText}>
                            Add {selected.size > 0 ? `${selected.size} ` : ''}Items
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12 },
    headerIconBtn: { padding: 8 },

    body: { flex: 1, paddingHorizontal: 20 },
    titleInput: { fontSize: 28, fontWeight: '600', color: '#3c4043', paddingVertical: 12 },

    optionsRow: { flexDirection: 'row', gap: 24, marginTop: 16, marginBottom: 8 },
    optionBtn: { alignItems: 'center', width: 96 },
    optionIconCircle: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: '#e8f0fe',
        justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    },
    optionLabel: { fontSize: 13, color: '#3c4043', textAlign: 'center' },

    selectedHeading: { marginTop: 16, fontSize: 14, fontWeight: '600', color: '#5f6368' },
    previewCell: { width: THUMB, height: THUMB, margin: 2, borderRadius: 8, overflow: 'hidden' },
    previewImage: { width: '100%', height: '100%' },
    previewRemoveBtn: {
        position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    },

    pickerHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
    },
    pickerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    gridCell: { width: width / 3, height: width / 3 },
    gridImage: { width: '100%', height: '100%' },
    selectDot: {
        position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12,
        borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    selectDotActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
    pickerFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
    confirmBtn: { backgroundColor: '#1a73e8', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
    confirmBtnDisabled: { backgroundColor: '#8ab4f8' },
    confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});