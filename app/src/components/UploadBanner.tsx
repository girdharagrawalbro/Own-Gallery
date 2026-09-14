import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { isActiveUpload, useUploads } from '../context/UploadContext';
import UploadStatusModal from '../screens/Gallery/UploadStatusModal';

const UploadBanner = () => {
    const { tasks } = useUploads();
    const [modalVisible, setModalVisible] = useState(false);

    const activeCount = tasks.filter(isActiveUpload).length;
    const failedCount = tasks.filter(t => t.status === 'failed').length;

    if (activeCount === 0 && failedCount === 0 && !modalVisible) {
        return null;
    }

    return (
        <>
            {(activeCount > 0 || failedCount > 0) && (
                <Pressable
                    style={[styles.fabBanner, activeCount === 0 && styles.fabFailed]}
                    onPress={() => setModalVisible(true)}
                >
                    {activeCount > 0 ? (
                        <>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.countText}>{activeCount}</Text>
                        </>
                    ) : (
                        <>
                            <AlertCircle size={20} color="#fff" />
                            <Text style={styles.countText}>{failedCount}</Text>
                        </>
                    )}
                </Pressable>
            )}

            <UploadStatusModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
            />
        </>
    );
};

const styles = StyleSheet.create({
    fabBanner: {
        position: 'absolute',
        bottom: 90,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#1a73e8',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
        zIndex: 1000,
    },
    fabFailed: {
        backgroundColor: '#d93025',
    },
    countText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 2,
    },
});

export default UploadBanner;
