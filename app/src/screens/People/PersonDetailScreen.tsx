import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, MoreVertical, Pencil, X } from 'lucide-react-native';
import RemoteImage from '../../components/RemoteImage';
import { getPersonMedia, getPerson, updatePerson, deletePerson } from '../../api/people';
import { Person } from '../../types/people';
import { Media } from '../../types/media';

const { width } = Dimensions.get('window');
const CELL = (width - 4) / 3;

// Circular face crop component
const FaceCrop = ({ person, size }: { person: Person; size: number }) => {
    const thumbnailUrl = person.cover_thumbnail_url;
    const face = person.cover_face;

    if (!thumbnailUrl) {
        return (
            <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]} />
        );
    }
    if (!face) {
        return (
            <Image
                source={{ uri: thumbnailUrl }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
            />
        );
    }
    const faceW = face.box_right - face.box_left;
    const faceH = face.box_bottom - face.box_top;
    const scale = 1 / Math.max(faceW, faceH);
    const imgSize = size * scale;
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
            <Image
                source={{ uri: thumbnailUrl }}
                style={{
                    width: imgSize,
                    height: imgSize,
                    marginLeft: -face.box_left * imgSize,
                    marginTop: -face.box_top * imgSize,
                }}
            />
        </View>
    );
};

const PersonDetailScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();

    const { personId } = route.params as { personId: number; personName: string };

    const [person, setPerson] = useState<Person | null>(null);
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);

    // Inline name editing
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const [savingName, setSavingName] = useState(false);

    const fetch = useCallback(async () => {
        try {
            const [personData, mediaData] = await Promise.all([
                getPerson(personId),
                getPersonMedia(personId),
            ]);
            setPerson(personData);
            setNameInput(personData.name);
            setMedia(mediaData.results);
        } catch (err) {
            console.error('Failed to fetch person detail', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [personId]);

    useEffect(() => { fetch(); }, [fetch]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetch(); }, [fetch]);

    const handleSaveName = async () => {
        if (!person) return;
        setSavingName(true);
        try {
            const updated = await updatePerson(person.id, { name: nameInput });
            setPerson(updated);
            setEditingName(false);
        } catch (err) {
            Alert.alert('Error', 'Failed to save name');
        } finally {
            setSavingName(false);
        }
    };

    const handleHide = async () => {
        setMenuVisible(false);
        if (!person) return;
        try {
            const updated = await updatePerson(person.id, { is_hidden: true });
            setPerson(updated);
            navigation.goBack();
        } catch {
            Alert.alert('Error', 'Failed to hide person');
        }
    };

    const handleDelete = () => {
        setMenuVisible(false);
        Alert.alert(
            'Remove Person',
            'This will remove the person group but keep the photos. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        if (!person) return;
                        try {
                            await deletePerson(person.id);
                            navigation.goBack();
                        } catch {
                            Alert.alert('Error', 'Failed to remove person');
                        }
                    },
                },
            ],
        );
    };

    const renderMedia = ({ item }: { item: Media }) => (
        <Pressable
            style={styles.mediaCell}
            onPress={() => navigation.navigate('MediaViewer', { mediaId: item.id })}
        >
            <RemoteImage uri={item.thumbnail_url} style={styles.mediaCellImage} />
        </Pressable>
    );

    const ListHeader = () => (
        <View style={styles.profileArea}>
            {person && (
                <View style={[styles.avatarShadow]}>
                    <FaceCrop person={person} size={96} />
                </View>
            )}

            {editingName ? (
                <View style={styles.nameEditRow}>
                    <TextInput
                        style={styles.nameInput}
                        value={nameInput}
                        onChangeText={setNameInput}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleSaveName}
                        placeholder="Add name"
                        placeholderTextColor="#aaa"
                    />
                    <TouchableOpacity onPress={handleSaveName} hitSlop={12} style={styles.nameConfirmBtn} disabled={savingName}>
                        {savingName
                            ? <ActivityIndicator size="small" color="#1a73e8" />
                            : <Check size={20} color="#1a73e8" />
                        }
                    </TouchableOpacity>
                </View>
            ) : (
                <Pressable onPress={() => setEditingName(true)} style={styles.nameRow}>
                    <Text style={styles.personName}>{person?.display_name ?? '…'}</Text>
                    <Pencil size={16} color="#888" style={{ marginLeft: 6 }} />
                </Pressable>
            )}

            <Text style={styles.mediaCountLabel}>{person?.media_count ?? 0} photos</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
                    <ArrowLeft size={24} color="#3c4043" />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={12} style={styles.iconBtn}>
                    <MoreVertical size={22} color="#3c4043" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1a73e8" />
                </View>
            ) : (
                <FlatList
                    data={media}
                    numColumns={3}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderMedia}
                    ListHeaderComponent={<ListHeader />}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1a73e8']} />}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={styles.emptyLabel}>No photos found for this person</Text>
                        </View>
                    }
                />
            )}

            {/* More menu */}
            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
                    <View style={StyleSheet.absoluteFill}>
                        <View style={[styles.menu, { top: insets.top + 56, right: 16 }]}>
                            <TouchableOpacity style={styles.menuItem} onPress={handleHide}>
                                <Text style={styles.menuItemText}>Hide from People</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                                <Text style={[styles.menuItemText, { color: '#e53935' }]}>Remove person group</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
};

export default PersonDetailScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingBottom: 8,
        backgroundColor: '#fff',
    },
    iconBtn: { padding: 10 },

    profileArea: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
    avatarShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
        borderRadius: 48,
        backgroundColor: '#fff',
        marginBottom: 14,
    },
    avatarPlaceholder: { backgroundColor: '#e8e8e8' },

    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    personName: { fontSize: 22, fontWeight: '600', color: '#1c1b1f' },
    nameEditRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, borderBottomWidth: 2, borderBottomColor: '#1a73e8' },
    nameInput: { fontSize: 22, fontWeight: '600', color: '#1c1b1f', flex: 1, paddingVertical: 4 },
    nameConfirmBtn: { padding: 6 },
    mediaCountLabel: { fontSize: 14, color: '#777', marginTop: 4 },

    mediaCell: { width: CELL, height: CELL, margin: 0.5 },
    mediaCellImage: { width: '100%', height: '100%' },

    menu: {
        position: 'absolute',
        backgroundColor: '#fff',
        borderRadius: 12,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        minWidth: 220,
        overflow: 'hidden',
    },
    menuItem: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
    menuItemText: { fontSize: 15, color: '#3c4043' },

    emptyLabel: { fontSize: 15, color: '#888' },
});
