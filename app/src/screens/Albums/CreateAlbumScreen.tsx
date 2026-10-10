
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
import { PhotoPickerModal } from '../../components/PhotoPickerModal';
import { createAlbum, addMediaToAlbum } from '../../api/albums';
import { getMedia } from '../../api/media';
import { Media } from '../../types/media';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');
const THUMB = (width - 48 - 24) / 4; // 4-up preview grid

const CreateAlbumScreen = () => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
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
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                {canSave && (
                    <TouchableOpacity onPress={handleSave} hitSlop={12} style={styles.headerIconBtn} disabled={saving}>
                        {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Check size={24} color={colors.primary} />}
                    </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
            </View>

            <View style={styles.body}>
                <TextInput
                    style={styles.titleInput}
                    placeholder="Add a title"
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={title}
                    onChangeText={setTitle}
                    multiline
                />

                <View style={styles.optionsRow}>
                    <TouchableOpacity style={styles.optionBtn} onPress={handleSelectPeopleAndPets}>
                        <View style={styles.optionIconCircle}>
                            <Users size={22} color={colors.primary} />
                        </View>
                        <Text style={styles.optionLabel}>Select people & pets</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionBtn} onPress={() => setPhotoPickerVisible(true)}>
                        <View style={styles.optionIconCircle}>
                            <ImageIcon size={22} color={colors.primary} />
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

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12 },
    headerIconBtn: { padding: 8 },
    body: { flex: 1, paddingHorizontal: 20 },
    titleInput: { fontSize: 28, fontWeight: '600', color: colors.text, paddingVertical: 12 },
    optionsRow: { flexDirection: 'row', gap: 24, marginTop: 16, marginBottom: 8 },
    optionBtn: { alignItems: 'center', width: 96 },
    optionIconCircle: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceVariant,
        justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    },
    optionLabel: { fontSize: 13, color: colors.text, textAlign: 'center' },
    selectedHeading: { marginTop: 16, fontSize: 14, fontWeight: '600', color: colors.onSurfaceVariant },
    previewCell: { width: THUMB, height: THUMB, margin: 2, borderRadius: 8, overflow: 'hidden' },
    previewImage: { width: '100%', height: '100%' },
    previewRemoveBtn: {
        position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    },
});
