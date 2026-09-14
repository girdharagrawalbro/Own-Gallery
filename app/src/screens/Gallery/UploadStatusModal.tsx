import React, { useCallback, useMemo } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { isFinishedUpload, UploadTask, UploadTaskStatus, useUploads } from '../../context/UploadContext';

interface Props {
    visible: boolean;
    onClose: () => void;
}

const ORDER: Record<UploadTaskStatus, number> = {
    uploading: 0,
    processing: 1,
    queued: 2,
    failed: 3,
    duplicate: 4,
    completed: 5,
};

interface RowProps {
    item: UploadTask;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
}

const TaskRow = React.memo(({ item, onCancel, onRetry }: RowProps) => (
    <View style={styles.assetContainer}>
        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        <View style={styles.infoContainer}>
            <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>

            {item.status === 'queued' && <Text style={styles.statusText}>Waiting…</Text>}

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
                    <Text style={styles.statusText}>Processing on server…</Text>
                    <ActivityIndicator size="small" color="#1a73e8" style={styles.processingSpinner} />
                </View>
            )}

            {item.status === 'completed' && <Text style={styles.successText}>Backed up</Text>}
            {item.status === 'duplicate' && <Text style={styles.duplicateText}>Already backed up</Text>}
            {item.status === 'failed' && (
                <Text style={styles.errorText} numberOfLines={2}>{item.error || 'Failed'}</Text>
            )}
        </View>

        {item.status === 'failed' && (
            <Pressable style={styles.retryBtn} onPress={() => onRetry(item.id)} hitSlop={6}>
                <RotateCcw size={14} color="#1a73e8" />
                <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
        )}

        {(item.status === 'queued' || item.status === 'uploading' || item.status === 'processing' || item.status === 'failed') && (
            <Pressable style={styles.cancelBtn} onPress={() => onCancel(item.id)} hitSlop={6}>
                <Text style={styles.cancelBtnText}>{item.status === 'failed' ? 'Remove' : 'Cancel'}</Text>
            </Pressable>
        )}
    </View>
));

const UploadStatusModal = ({ visible, onClose }: Props) => {
    const { tasks, clearCompletedTasks, cancelTask, retryTask, retryAllFailed } = useUploads();

    const sortedTasks = useMemo(
        () => [...tasks].sort((a, b) => ORDER[a.status] - ORDER[b.status]),
        [tasks],
    );

    const failedCount = tasks.filter(t => t.status === 'failed').length;
    const hasFinished = tasks.some(isFinishedUpload);

    const renderItem = useCallback(
        ({ item }: { item: UploadTask }) => <TaskRow item={item} onCancel={cancelTask} onRetry={retryTask} />,
        [cancelTask, retryTask],
    );

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
                    data={visible ? sortedTasks : []}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={<Text style={styles.emptyText}>No active uploads.</Text>}
                />

                {(hasFinished || failedCount > 0) && (
                    <View style={styles.footer}>
                        {failedCount > 0 && (
                            <Pressable style={[styles.footerBtn, styles.retryAllBtn]} onPress={retryAllFailed}>
                                <Text style={styles.retryAllText}>Retry failed ({failedCount})</Text>
                            </Pressable>
                        )}
                        {hasFinished && (
                            <Pressable style={[styles.footerBtn, styles.clearBtn]} onPress={clearCompletedTasks}>
                                <Text style={styles.clearBtnText}>Clear finished</Text>
                            </Pressable>
                        )}
                    </View>
                )}
            </View>
        </Modal>
    );
};

export default UploadStatusModal;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
    closeBtn: { padding: 8 },
    closeBtnText: { fontSize: 16, color: '#1a73e8' },
    listContent: { padding: 16 },
    assetContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        padding: 8,
    },
    thumbnail: { width: 56, height: 56, borderRadius: 4, backgroundColor: '#eee' },
    infoContainer: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    fileName: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 6 },
    statusText: { fontSize: 12, color: '#666', marginBottom: 4 },
    processingRow: { flexDirection: 'row', alignItems: 'center' },
    processingSpinner: { marginLeft: 8 },
    progressContainer: {
        height: 4,
        backgroundColor: '#e8eaed',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 2,
    },
    progressBar: { height: '100%', backgroundColor: '#1a73e8' },
    successText: { fontSize: 12, color: '#188038', fontWeight: '500' },
    duplicateText: { fontSize: 12, color: '#5f6368', fontWeight: '500' },
    errorText: { fontSize: 12, color: '#d93025', fontWeight: '500' },
    emptyText: { textAlign: 'center', color: '#999', marginTop: 32 },
    footer: {
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    footerBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
    retryAllBtn: { backgroundColor: '#e8f0fe' },
    retryAllText: { color: '#1a73e8', fontSize: 15, fontWeight: '600' },
    clearBtn: { backgroundColor: '#f1f3f4' },
    clearBtnText: { color: '#333', fontSize: 15, fontWeight: '600' },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#e8f0fe',
        borderRadius: 16,
        marginLeft: 8,
    },
    retryBtnText: { color: '#1a73e8', fontSize: 12, fontWeight: '600' },
    cancelBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#fce8e6',
        borderRadius: 16,
        marginLeft: 8,
    },
    cancelBtnText: { color: '#d93025', fontSize: 12, fontWeight: '600' },
});
