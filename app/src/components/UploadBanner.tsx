import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, SafeAreaView } from 'react-native';
import { useUploads } from '../context/UploadContext';
import UploadStatusModal from '../screens/Gallery/UploadStatusModal';

const UploadBanner = () => {
    const { tasks } = useUploads();
    const [modalVisible, setModalVisible] = useState(false);

    const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
    
    if (activeTasks.length === 0) return null;

    const uploadingCount = activeTasks.filter(t => t.status === 'uploading').length;
    const processingCount = activeTasks.filter(t => t.status === 'processing').length;

    let bannerText = '';
    if (uploadingCount > 0 && processingCount > 0) {
        bannerText = `Uploading ${uploadingCount}, Processing ${processingCount}...`;
    } else if (uploadingCount > 0) {
        bannerText = `Uploading ${uploadingCount} item${uploadingCount > 1 ? 's' : ''}...`;
    } else if (processingCount > 0) {
        bannerText = `Processing ${processingCount} item${processingCount > 1 ? 's' : ''}...`;
    }

    return (
        <>
            <SafeAreaView style={styles.safeArea}>
                <Pressable style={styles.container} onPress={() => setModalVisible(true)}>
                    <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.text}>{bannerText}</Text>
                </Pressable>
            </SafeAreaView>
            
            <UploadStatusModal 
                visible={modalVisible} 
                onClose={() => setModalVisible(false)} 
            />
        </>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        backgroundColor: '#007AFF',
    },
    container: {
        backgroundColor: '#007AFF',
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    }
});

export default UploadBanner;
