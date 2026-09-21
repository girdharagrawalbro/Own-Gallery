import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Cloud } from 'lucide-react-native';
import { useUploads, isActiveUpload } from '../context/UploadContext';

const CloudIndicator = () => {
    const { tasks } = useUploads();
    const isUploading = tasks.some(isActiveUpload);
    const pulseAnim = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        if (isUploading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 0.6, duration: 750, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [isUploading, pulseAnim]);

    return (
        <View style={styles.container}>
            <Animated.View style={{ opacity: pulseAnim }}>
                <Cloud size={20} color={isUploading ? '#1a73e8' : '#5f6368'} />
            </Animated.View>
            {!isUploading && <View style={styles.dot} />}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#2196F3',
        borderWidth: 1.5,
        borderColor: '#fff',
    }
});

export default CloudIndicator;
