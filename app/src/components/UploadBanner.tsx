import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useUploads } from '../context/UploadContext';
import UploadStatusModal from '../screens/Gallery/UploadStatusModal';

const UploadBanner = () => {
    const { tasks } = useUploads();
    const [modalVisible, setModalVisible] = useState(false);

    const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
    
    if (activeTasks.length === 0) return null;

    return (
        <>
            <Pressable style={styles.fabBanner} onPress={() => setModalVisible(true)}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.countText}>{activeTasks.length}</Text>
            </Pressable>
            
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
        backgroundColor: '#1a73e8', // Google Blue to match Gallery FAB
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
    countText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 2,
    }
});

export default UploadBanner;
