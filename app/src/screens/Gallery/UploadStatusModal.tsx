import React from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    FlatList,
    Image,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { useUploads, UploadTask } from '../../context/UploadContext';

interface Props {
    visible: boolean;
    onClose: () => void;
}

const UploadStatusModal = ({ visible, onClose }: Props) => {
    const { tasks, clearCompletedTasks, cancelTask } = useUploads();

    // Display incomplete or failed tasks first, then completed
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (b.status === 'completed' && a.status !== 'completed') return -1;
        return 0;
    });

    const renderItem = ({ item }: { item: UploadTask }) => {
        return (
            <View style={styles.assetContainer}>
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                <View style={styles.infoContainer}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                    
                    {item.status === 'uploading' && (
                        <>
                            <Text style={styles.statusText}>Uploading {item.progress}%</Text>
                            <View style={styles.progressContainer}>
                                <View style={[styles.progressBar, { width: `${item.progress}%` }]} />
                            </View>
                        </>
                    )}

                    {item.status === 'processing' && (
                        <View style={styles.processingRow}>
                            <Text style={styles.statusText}>Processing on server...</Text>
                            <ActivityIndicator size="small" color="#007AFF" style={{ marginLeft: 8 }} />
                        </View>
                    )}

                    {item.status === 'completed' && (
                        <Text style={styles.successText}>Completed</Text>
                    )}

                    {item.status === 'failed' && (
                        <Text style={styles.errorText}>{item.error || 'Failed'}</Text>
                    )}
                </View>
                
                {(item.status === 'uploading' || item.status === 'processing' || item.status === 'failed') && (
                    <Pressable style={styles.cancelBtn} onPress={() => cancelTask(item.id)}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Upload Status</Text>
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>Close</Text>
                    </Pressable>
                </View>

                <FlatList
                    data={sortedTasks}
                    keyExtractor={(item, index) => `${item.id}-${index}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No active uploads.</Text>
                    }
                />

                {tasks.some(t => t.status === 'completed' || t.status === 'failed') && (
                    <View style={styles.footer}>
                        <Pressable 
                            style={styles.clearBtn} 
                            onPress={clearCompletedTasks}
                        >
                            <Text style={styles.clearBtnText}>Clear Completed</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </Modal>
    );
};

export default UploadStatusModal;

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
    statusText: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    processingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressContainer: {
        height: 4,
        backgroundColor: '#eee',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 4,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#007AFF',
    },
    successText: {
        fontSize: 12,
        color: '#34c759',
        fontWeight: '500',
    },
    errorText: {
        fontSize: 12,
        color: '#ff3b30',
        fontWeight: '500',
    },
    emptyText: {
        textAlign: 'center',
        color: '#999',
        marginTop: 32,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    clearBtn: {
        backgroundColor: '#f0f0f0',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    clearBtnText: {
        color: '#333',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#ffebee',
        borderRadius: 16,
        marginLeft: 8,
    },
    cancelBtnText: {
        color: '#ff3b30',
        fontSize: 12,
        fontWeight: '600',
    }
});
