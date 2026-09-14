import React, { useState, useEffect } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    FlatList,
    Image,
    Pressable,
} from 'react-native';
import { Asset, launchImageLibrary } from 'react-native-image-picker';
import { Trash2, Plus } from 'lucide-react-native';
import { useUploadActions } from '../../context/UploadContext';

interface Props {
    visible: boolean;
    assets: Asset[];
    albumId?: number;
    onClose: () => void;
    onUploadComplete: () => void;
}

const UploadPreviewModal = ({ visible, assets: initialAssets, albumId, onClose, onUploadComplete }: Props) => {
    const { uploadFiles } = useUploadActions();
    const [localAssets, setLocalAssets] = useState<Asset[]>([]);

    useEffect(() => {
        if (visible) {
            setLocalAssets(initialAssets);
        }
    }, [visible, initialAssets]);

    const handleUpload = async () => {
        if (localAssets.length === 0) return;
        uploadFiles(localAssets, albumId);
        onUploadComplete();
        onClose();
    };

    const handleRemove = (indexToRemove: number) => {
        setLocalAssets(prev => prev.filter((_, i) => i !== indexToRemove));
    };

    const handleAddMore = async () => {
        const result = await launchImageLibrary({
            mediaType: 'mixed',
            selectionLimit: 0,
            includeExtra: true,
        });

        if (result.assets && result.assets.length > 0) {
            setLocalAssets(prev => {
                const newAssets = result.assets || [];
                const existingUris = new Set(prev.map(a => a.uri));
                const uniqueNewAssets = newAssets.filter(a => !existingUris.has(a.uri));
                return [...prev, ...uniqueNewAssets];
            });
        }
    };

    const renderItem = ({ item, index }: { item: Asset; index: number }) => {
        return (
            <View style={styles.assetContainer}>
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                <View style={styles.infoContainer}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.fileName || 'Unnamed file'}</Text>
                </View>
                <Pressable onPress={() => handleRemove(index)} style={styles.removeBtn}>
                    <Trash2 size={20} color="#ff3b30" />
                </Pressable>
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.headerTitle}>Upload {localAssets.length} items</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <Pressable onPress={handleAddMore} style={styles.addMoreBtn}>
                            <Plus size={20} color="#007AFF" />
                        </Pressable>
                        <Pressable onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>

                <FlatList
                    data={localAssets}
                    keyExtractor={(item, index) => `${item.uri}-${index}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No items selected.</Text>
                        </View>
                    }
                />

                <View style={styles.footer}>
                    <Pressable 
                        style={[styles.uploadBtn, localAssets.length === 0 && styles.uploadBtnDisabled]} 
                        onPress={handleUpload}
                        disabled={localAssets.length === 0}
                    >
                        <Text style={styles.uploadBtnText}>Upload All</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

export default UploadPreviewModal;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerLeft: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    addMoreBtn: {
        padding: 8,
        marginRight: 8,
        backgroundColor: '#f0f8ff',
        borderRadius: 8,
    },
    closeBtn: {
        padding: 8,
    },
    closeBtnText: {
        fontSize: 16,
        color: '#007AFF',
    },
    listContent: {
        padding: 16,
    },
    assetContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
        padding: 8,
    },
    thumbnail: {
        width: 60,
        height: 60,
        borderRadius: 4,
        backgroundColor: '#eee',
    },
    infoContainer: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    fileName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
    removeBtn: {
        padding: 12,
    },
    emptyContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#999',
        fontSize: 16,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    uploadBtn: {
        backgroundColor: '#007AFF',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    uploadBtnDisabled: {
        backgroundColor: '#99ccff',
    },
    uploadBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
