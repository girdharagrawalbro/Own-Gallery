import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    ToastAndroid,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Check,
    ArrowUpDown,
    Sparkles,
    Pencil,
    X,
    Plus,
    Type,
    MapPin,
} from 'lucide-react-native';
import RemoteImage from '../../components/RemoteImage';
import AddMediaModal from './AddMediaModal';
import { getAlbumMedia, removeMediaFromAlbum, setAlbumCover, updateAlbum } from '../../api/albums';
import { Media } from '../../types/media';
import { mediaDate } from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');
const CELL = (width - 48 - 24) / 4;

type SortOption = 'newest' | 'oldest' | 'recently_added';

const SORT_LABELS: Record<SortOption, string> = {
    newest: 'Newest first',
    oldest: 'Oldest first',
    recently_added: 'Recently added',
};

interface Props {
    visible: boolean;
    albumId: number;
    albumName: string;
    albumDescription: string;
    coverUrl: string | null;
    media: Media[];
    onClose: () => void;
    onSaved: (changes: { name?: string; description?: string; coverUrl?: string }) => void;
}

const AlbumEditModal = ({ visible, albumId, albumName, albumDescription, coverUrl, media, onClose, onSaved }: Props) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const [name, setName] = useState(albumName);
    const [editingName, setEditingName] = useState(false);
    const [description, setDescription] = useState(albumDescription);
    const [localMedia, setLocalMedia] = useState<Media[]>(media);
    const [cover, setCover] = useState<string | null>(coverUrl);
    const [saving, setSaving] = useState(false);

    const [sortBy, setSortBy] = useState<SortOption>('recently_added');
    const [sortMenuVisible, setSortMenuVisible] = useState(false);

    const [coverPickerVisible, setCoverPickerVisible] = useState(false);
    const [addItemsVisible, setAddItemsVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            setName(albumName);
            setDescription(albumDescription);
            setLocalMedia(media);
            setCover(coverUrl);
            setEditingName(false);
            setSortMenuVisible(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const sortedMedia = useMemo(() => {
        const copy = [...localMedia];
        switch (sortBy) {
            case 'oldest':
                copy.sort((a, b) => mediaDate(a).getTime() - mediaDate(b).getTime());
                break;
            case 'recently_added':
                // No distinct "added at" timestamp is exposed on Media yet — falls back to id desc
                // (insertion order) as the closest available proxy.
                copy.sort((a, b) => b.id - a.id);
                break;
            case 'newest':
            default:
                copy.sort((a, b) => mediaDate(b).getTime() - mediaDate(a).getTime());
                break;
        }
        return copy;
    }, [localMedia, sortBy]);

    const refreshFromServer = async () => {
        try {
            const data = await getAlbumMedia(albumId);
            setLocalMedia(data.media);
        } catch (err) {
            console.error('Failed to refresh album media', err);
        }
    };

    const handleRemoveItem = async (id: number) => {
        const prev = localMedia;
        setLocalMedia(current => current.filter(m => m.id !== id));
        try {
            await removeMediaFromAlbum(albumId, [id]);
        } catch {
            setLocalMedia(prev); // revert on failure
            Alert.alert('Error', 'Failed to remove item');
        }
    };

    const handleAddHighlight = () => {
        // TODO: "Highlight" isn't modeled on Album yet (no field for a featured/highlight photo
        // set beyond `cover_url`). Add a backend field + this picker once the feature is defined.
        Alert.alert('Add Highlight', 'Highlight photos aren\u2019t wired up yet.');
    };

    const handleAddText = () => {
        // TODO: adding a text/caption card to an album needs a backend concept for non-media
        // album entries. Stubbed until that exists.
        Alert.alert('Add Text', 'Text cards aren\u2019t wired up yet.');
    };

    const handleAddLocation = () => {
        // TODO: same as the detail screen's "edit location" — Album/Media have no location
        // field yet.
        Alert.alert('Add Location', 'Location tagging isn\u2019t wired up yet.');
    };

    const handlePickCover = async (item: Media) => {
        setCoverPickerVisible(false);
        try {
            const updated = await setAlbumCover(albumId, item.id);
            if (updated.cover_url) {
                setCover(updated.cover_url);
                ToastAndroid.show('Album cover updated', ToastAndroid.SHORT);
            }
        } catch {
            Alert.alert('Error', 'Failed to set cover');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const trimmedName = name.trim();
            const payload: { name?: string; description?: string } = {};
            if (trimmedName && trimmedName !== albumName) payload.name = trimmedName;
            if (description !== albumDescription) payload.description = description;
            if (Object.keys(payload).length > 0) {
                await updateAlbum(albumId, payload);
            }
            onSaved({
                name: payload.name,
                description: payload.description,
                coverUrl: cover || undefined,
            });
            onClose();
        } catch (err) {
            console.error('Failed to save album edits', err);
            Alert.alert('Error', 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleSave} hitSlop={12} style={styles.headerIconBtn} disabled={saving}>
                        {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Check size={24} color={colors.primary} />}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => setSortMenuVisible(v => !v)} hitSlop={12} style={styles.headerIconBtn}>
                        <ArrowUpDown size={22} color={colors.text} />
                    </TouchableOpacity>
                </View>

                {sortMenuVisible && (
                    <View style={styles.sortMenu}>
                        {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
                            <TouchableOpacity
                                key={opt}
                                style={styles.sortMenuItem}
                                onPress={() => { setSortBy(opt); setSortMenuVisible(false); }}
                            >
                                <Text style={styles.sortMenuItemText}>{SORT_LABELS[opt]}</Text>
                                {sortBy === opt && <Check size={16} color={colors.primary} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <FlatList
                    data={sortedMedia}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={4}
                    ListHeaderComponent={
                        <View style={styles.formArea}>
                            <TouchableOpacity style={styles.highlightRow} onPress={handleAddHighlight}>
                                <Sparkles size={18} color={colors.primary} />
                                <Text style={styles.highlightText}>Add highlight</Text>
                            </TouchableOpacity>

                            <Pressable style={styles.coverWrap} onPress={() => setCoverPickerVisible(true)}>
                                {cover ? (
                                    <RemoteImage uri={cover} style={styles.coverImage} />
                                ) : (
                                    <View style={[styles.coverImage, styles.coverPlaceholder]} />
                                )}
                                <View style={styles.coverEditPen}>
                                    <Pencil size={16} color="#fff" />
                                </View>
                            </Pressable>

                            {editingName ? (
                                <TextInput
                                    style={styles.nameInput}
                                    value={name}
                                    onChangeText={setName}
                                    autoFocus
                                    onBlur={() => setEditingName(false)}
                                    returnKeyType="done"
                                    onSubmitEditing={() => setEditingName(false)}
                                />
                            ) : (
                                <Pressable onPress={() => setEditingName(true)}>
                                    <Text style={styles.nameText}>{name || 'Untitled Album'}</Text>
                                </Pressable>
                            )}

                            <TextInput
                                style={styles.descInput}
                                placeholder="Add description"
                                placeholderTextColor={colors.onSurfaceVariant}
                                value={description}
                                onChangeText={setDescription}
                                multiline
                            />

                            <Text style={styles.itemsHeading}>{sortedMedia.length} items</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.cell}>
                            <RemoteImage uri={item.thumbnail_url} style={styles.cellImage} />
                            <TouchableOpacity
                                style={styles.cellRemoveBtn}
                                onPress={() => handleRemoveItem(item.id)}
                                hitSlop={8}
                            >
                                <X size={12} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}
                    contentContainerStyle={{ paddingBottom: 100 }}
                />

                <View style={styles.bottomBar}>
                    <TouchableOpacity style={styles.bottomBarBtn} onPress={() => setAddItemsVisible(true)}>
                        <Plus size={22} color={colors.text} />
                        <Text style={styles.bottomBarLabel}>Add items</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.bottomBarBtn} onPress={handleAddText}>
                        <Type size={22} color={colors.text} />
                        <Text style={styles.bottomBarLabel}>Text</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.bottomBarBtn} onPress={handleAddLocation}>
                        <MapPin size={22} color={colors.text} />
                        <Text style={styles.bottomBarLabel}>Location</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Cover picker: choose any current album item as the new cover */}
            <Modal visible={coverPickerVisible} transparent animationType="fade" onRequestClose={() => setCoverPickerVisible(false)}>
                <View style={styles.coverPickerOverlay}>
                    <View style={styles.coverPickerSheet}>
                        <Text style={styles.coverPickerTitle}>Choose album cover</Text>
                        <FlatList
                            data={localMedia}
                            keyExtractor={(item) => item.id.toString()}
                            numColumns={4}
                            renderItem={({ item }) => (
                                <Pressable style={styles.cell} onPress={() => handlePickCover(item)}>
                                    <RemoteImage uri={item.thumbnail_url} style={styles.cellImage} />
                                </Pressable>
                            )}
                        />
                        <TouchableOpacity style={styles.coverPickerCancel} onPress={() => setCoverPickerVisible(false)}>
                            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <AddMediaModal
                visible={addItemsVisible}
                albumId={albumId}
                onClose={() => setAddItemsVisible(false)}
                onAdded={refreshFromServer}
            />
        </Modal>
    );
};

export default AlbumEditModal;

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerIconBtn: { padding: 8 },

    sortMenu: {
        position: 'absolute', top: 52, right: 12, zIndex: 10,
        backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6,
    },
    sortMenuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, minWidth: 180 },
    sortMenuItemText: { fontSize: 14, color: colors.text },

    formArea: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
    highlightRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
    highlightText: { fontSize: 15, color: colors.primary, fontWeight: '500' },

    coverWrap: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', marginBottom: 16, backgroundColor: colors.surfaceVariant },
    coverImage: { width: '100%', height: '100%' },
    coverPlaceholder: { backgroundColor: colors.surfaceVariant },
    coverEditPen: {
        position: 'absolute', bottom: 4, right: 4, width: 26, height: 26, borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    },

    nameText: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
    nameInput: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.primary, paddingVertical: 2 },

    descInput: { fontSize: 15, color: colors.text, marginBottom: 12, minHeight: 40 },
    itemsHeading: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 8, marginBottom: 4, fontWeight: '600' },

    cell: { width: CELL, height: CELL, margin: 2, borderRadius: 6, overflow: 'hidden' },
    cellImage: { width: '100%', height: '100%' },
    cellRemoveBtn: {
        position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center',
    },

    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around',
        paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    },
    bottomBarBtn: { alignItems: 'center', gap: 4 },
    bottomBarLabel: { fontSize: 12, color: colors.text },

    coverPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    coverPickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '70%' },
    coverPickerTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12, textAlign: 'center' },
    coverPickerCancel: { alignItems: 'center', paddingVertical: 14 },
});