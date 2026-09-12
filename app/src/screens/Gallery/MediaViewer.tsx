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
import { Share as ShareIcon, Download, Heart, Trash2, X, FolderPlus, Info, Link as LinkIcon } from 'lucide-react-native';
import SelectAlbumModal from '../Albums/SelectAlbumModal';
import { Share as RNShare } from 'react-native';
import { createShareLink } from '../../api/media';

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
    const [infoVisible, setInfoVisible] = useState(false);

    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index);
        }
    }, []);

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    }).current;

    const handleDelete = () => {
        const item = media[activeIndex];
        if (!item) return;

        Alert.alert(
            "Move to Trash",
            "Are you sure you want to move this to trash?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            await moveToTrash(item.id);
                            if (onMediaDeleted) {
                                onMediaDeleted(item.id);
                            }
                            if (media.length <= 1) {
                                onClose();
                            }
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete media");
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                }
            ]
        );
    };

    const handleToggleFavorite = async () => {
        const item = media[activeIndex];
        if (!item) return;
        setIsProcessing(true);
        try {
            const updated = await toggleFavorite(item.id);
            if (onMediaUpdated) {
                onMediaUpdated(updated);
            }
        } catch (e) {
            Alert.alert("Error", "Failed to update favorite status");
        } finally {
            setIsProcessing(false);
        }
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

    const handleCopyLink = async () => {
        if (!currentItem) return;
        setIsProcessing(true);
        try {
            const link = await createShareLink(currentItem.id);
            await RNShare.share({ message: link, title: 'Share Media' });
        } catch (e) {
            Alert.alert("Error", "Failed to create link.");
        } finally {
            setIsProcessing(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Unknown';
        const d = new Date(dateStr);
        return d.toLocaleString();
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
                    
                    <Pressable style={styles.actionButton} onPress={handleCopyLink} disabled={isProcessing}>
                        <LinkIcon size={20} color="white" />
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

                    <Pressable style={styles.actionButton} onPress={() => setInfoVisible(true)} disabled={isProcessing}>
                        <Info size={20} color="white" />
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

            <Modal
                visible={infoVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setInfoVisible(false)}
            >
                <Pressable style={styles.infoOverlay} onPress={() => setInfoVisible(false)}>
                    <Pressable style={styles.infoSheet} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.infoDragHandle} />
                        <Text style={styles.infoTitle}>Details</Text>
                        
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Date Taken</Text>
                            <Text style={styles.infoValue}>{formatDate(currentItem?.taken_at || currentItem?.created_at || null)}</Text>
                        </View>
                        
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Size</Text>
                            <Text style={styles.infoValue}>{formatBytes(currentItem?.file_size || 0)}</Text>
                        </View>
                        
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Resolution</Text>
                            <Text style={styles.infoValue}>{currentItem?.width && currentItem?.height ? `${currentItem.width} x ${currentItem.height}` : 'Unknown'}</Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Type</Text>
                            <Text style={styles.infoValue}>{currentItem?.mime_type || currentItem?.media_type}</Text>
                        </View>

                    </Pressable>
                </Pressable>
            </Modal>

        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    topActions: {
        position: 'absolute',
        top: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        zIndex: 10,
        paddingHorizontal: 16,
        gap: 8,
    },
    actionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    page: {
        width,
        height,
        justifyContent: 'center',
        alignItems: 'center',
    },
    processingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    infoOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    infoSheet: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 24,
        paddingBottom: 40,
        minHeight: 300,
    },
    infoDragHandle: {
        width: 40,
        height: 5,
        backgroundColor: '#666',
        borderRadius: 2.5,
        alignSelf: 'center',
        marginBottom: 20,
    },
    infoTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#333',
    },
    infoLabel: {
        fontSize: 16,
        color: '#8e8e93',
    },
    infoValue: {
        fontSize: 16,
        color: '#fff',
        fontWeight: '500',
    }
});

export default MediaViewer;
