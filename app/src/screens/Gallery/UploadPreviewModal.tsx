import React, { useState } from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    FlatList,
    Image,
    Pressable,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { Asset } from 'react-native-image-picker';
import { useUploads } from '../../context/UploadContext';

const { width } = Dimensions.get('window');

interface Props {
    visible: boolean;
    assets: Asset[];
    albumId?: number;
    onClose: () => void;
    onUploadComplete: () => void;
}

const UploadPreviewModal = ({ visible, assets, albumId, onClose, onUploadComplete }: Props) => {
    const { uploadFiles } = useUploads();

    const handleUpload = async () => {
        uploadFiles(assets, albumId);
        onUploadComplete();
        onClose();
    };

    const renderItem = ({ item }: { item: Asset }) => {
        return (
            <View style={styles.assetContainer}>
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                <View style={styles.infoContainer}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.fileName || 'Unnamed file'}</Text>
                </View>
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Upload {assets.length} items</Text>
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>Cancel</Text>
                    </Pressable>
                </View>

                <FlatList
                    data={assets}
                    keyExtractor={item => item.uri!}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                />

                <View style={styles.footer}>
                    <Pressable 
                        style={styles.uploadBtn} 
                        onPress={handleUpload}
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
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111',
    },
    closeBtn: {
        padding: 8,
    },
    closeBtnText: {
        fontSize: 16,
        color: '#007AFF',
    },
    disabledText: {
        color: '#999',
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
        marginBottom: 8,
    },
    progressContainer: {
        height: 4,
        backgroundColor: '#eee',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#007AFF',
    },
    errorText: {
        fontSize: 12,
        color: '#ff3b30',
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
