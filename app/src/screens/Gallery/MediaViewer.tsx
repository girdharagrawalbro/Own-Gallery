import React, { useRef, useState, useCallback } from 'react';
import {
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    Alert,
    ActivityIndicator,
    ToastAndroid
} from 'react-native';
import Share from 'react-native-share';

import ZoomableImage from '../../components/ZoomableImage';
import VideoPlayer from '../../components/VideoPlayer';
import { Media } from '../../types/media';
import { toggleFavorite, moveToTrash, downloadMediaToDevice } from '../../api/media';
import { Share as ShareIcon, Download, Heart, Trash2, X, FolderPlus } from 'lucide-react-native';
import SelectAlbumModal from '../Albums/SelectAlbumModal';

const { width, height } = Dimensions.get('window');

interface Props {
    visible: boolean;
    media: Media[];
    initialIndex: number;
    onClose: () => void;
    onMediaUpdated?: (updatedMedia: Media) => void;
    onMediaDeleted?: (deletedMediaId: number) => void;
}

const MediaViewer = ({
    visible,
    media,
    initialIndex,
    onClose,
    onMediaUpdated,
    onMediaDeleted,
}: Props) => {
    const listRef = useRef<FlatList<Media>>(null);
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectAlbumVisible, setSelectAlbumVisible] = useState(false);

    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index);
        }
    }, []);

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const handleToggleFavorite = async () => {
        const currentMedia = media[activeIndex];
        if (!currentMedia) return;

        const newFavoriteStatus = !currentMedia.is_favorite;

        // Optimistic update via callback
        if (onMediaUpdated) {
            onMediaUpdated({ ...currentMedia, is_favorite: newFavoriteStatus });
        }

        try {
            await toggleFavorite(currentMedia.id, newFavoriteStatus);
            ToastAndroid.show(newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites', ToastAndroid.SHORT);
        } catch (err) {
            // Revert on failure
            if (onMediaUpdated) {
                onMediaUpdated(currentMedia);
            }
            console.log('Failed to toggle favorite', err);
        }
    };

    const handleDelete = () => {
        const currentMedia = media[activeIndex];
        if (!currentMedia) return;

        Alert.alert(
            'Move to Trash',
            'Are you sure you want to delete this item?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await moveToTrash(currentMedia.id);
                            ToastAndroid.show('Item moved to recently deleted', ToastAndroid.SHORT);
                            if (onMediaDeleted) {
                                onMediaDeleted(currentMedia.id);
                            }
                            if (media.length <= 1) {
                                onClose();
                            }
                        } catch (err) {
                            Alert.alert('Error', 'Failed to delete media');
                        }
                    }
                }
            ]
        );
    };

    const currentItem = media[activeIndex];

    const handleDownload = async () => {
        if (!currentItem) return;
        setIsProcessing(true);
        try {
            await downloadMediaToDevice(currentItem.id, currentItem.filename, true);
            ToastAndroid.show("Saved to device gallery!", ToastAndroid.SHORT);
        } catch (e) {
            Alert.alert("Error", "Failed to save file.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleShare = async () => {
        if (!currentItem) return;
        setIsProcessing(true);
        try {
            const uri = await downloadMediaToDevice(currentItem.id, currentItem.filename, false);
            await Share.open({
                url: uri,
                type: currentItem.mime_type,
            });
        } catch (e: any) {
            console.error("Share error:", e);
            if (e.message !== 'User did not share') {
                Alert.alert("Error", "Failed to share file: " + String(e));
            }
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            presentationStyle="fullScreen"
            onRequestClose={onClose}>

            <View style={styles.container}>

                <View style={styles.topActions}>
                    <Pressable style={styles.actionButton} onPress={handleShare} disabled={isProcessing}>
                        <ShareIcon size={20} color="white" />
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={handleDownload} disabled={isProcessing}>
                        <Download size={20} color="white" />
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={handleToggleFavorite} disabled={isProcessing}>
                        <Heart 
                            size={20} 
                            color={currentItem?.is_favorite ? "#FF3B30" : "white"} 
                            fill={currentItem?.is_favorite ? "#FF3B30" : "transparent"} 
                        />
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={() => setSelectAlbumVisible(true)} disabled={isProcessing}>
                        <FolderPlus size={20} color="white" />
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={handleDelete} disabled={isProcessing}>
                        <Trash2 size={20} color="white" />
                    </Pressable>

                    <Pressable style={styles.actionButton} onPress={onClose} disabled={isProcessing}>
                        <X size={20} color="white" />
                    </Pressable>
                </View>

                {isProcessing && (
                    <View style={styles.processingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                    </View>
                )}

                <FlatList
                    ref={listRef}
                    data={media}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={initialIndex}
                    keyExtractor={item => item.id.toString()}
                    getItemLayout={(_, index) => ({
                        length: width,
                        offset: width * index,
                        index,
                    })}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    renderItem={({ item, index }) => (
                        <View style={styles.page}>
                            {item.media_type === 'image' ? (
                                <ZoomableImage uri={item.content_url} isActive={index === activeIndex} />
                            ) : (
                                <VideoPlayer uri={item.content_url} isActive={index === activeIndex} />
                            )}
                        </View>
                    )}
                />

            </View>

            <SelectAlbumModal
                visible={selectAlbumVisible}
                mediaId={media[activeIndex]?.id || null}
                onClose={() => setSelectAlbumVisible(false)}
            />
        </Modal>
    );
};

export default MediaViewer;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },

    page: {
        width,
        height,
        justifyContent: 'center',
        alignItems: 'center',
    },

    topActions: {
        position: 'absolute',
        top: 45,
        right: 20,
        zIndex: 10,
        flexDirection: 'row',
        gap: 16,
    },

    actionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },

    actionText: {
        color: '#fff',
        fontSize: 18,
    },
    processingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    }
});
