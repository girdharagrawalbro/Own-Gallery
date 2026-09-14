import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    LayoutChangeEvent,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    Share as RNShare,
    StatusBar,
    StyleSheet,
    Text,
    ToastAndroid,
    View,
} from 'react-native';
import Share from 'react-native-share';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
    ArrowLeft,
    Download,
    FolderPlus,
    Heart,
    Link as LinkIcon,
    MoreVertical,
    Play,
    Share as ShareIcon,
    Trash2,
} from 'lucide-react-native';

import ZoomableImage from '../../components/ZoomableImage';
import VideoPlayer from '../../components/VideoPlayer';
import RemoteImage, { prefetchImages } from '../../components/RemoteImage';
import { Media } from '../../types/media';
import {
    createShareLink,
    downloadMediaToDevice,
    moveToTrash,
    toggleFavorite,
} from '../../api/media';
import SelectAlbumModal from '../Albums/SelectAlbumModal';
import { formatBytes, formatDayTitle, formatDuration, formatTime, mediaDate } from '../../utils/format';

interface Props {
    visible: boolean;
    media: Media[];
    initialIndex: number;
    /** Receives the index that was being shown, so the grid can scroll to it. */
    onClose: (lastIndex: number) => void;
    onMediaUpdated?: (updatedMedia: Media) => void;
    onMediaDeleted?: (deletedMediaId: number) => void;
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface PageProps {
    item: Media;
    isActive: boolean;
    width: number;
    height: number;
    controlsVisible: boolean;
    videoBottomOffset: number;
    onTap: () => void;
    onControlsVisibleChange: (visible: boolean) => void;
    onZoomChange: (zoomed: boolean) => void;
    onSwipeDown: () => void;
}

const ViewerPage = React.memo(({
    item,
    isActive,
    width,
    height,
    controlsVisible,
    videoBottomOffset,
    onTap,
    onControlsVisibleChange,
    onZoomChange,
    onSwipeDown,
}: PageProps) => {
    if (item.media_type === 'image') {
        return (
            <View style={{ width, height }}>
                <ZoomableImage
                    thumbnailUri={item.thumbnail_url}
                    previewUri={item.preview_url}
                    mediaWidth={item.width}
                    mediaHeight={item.height}
                    width={width}
                    height={height}
                    isActive={isActive}
                    onTap={onTap}
                    onZoomChange={onZoomChange}
                    onSwipeDown={onSwipeDown}
                />
            </View>
        );
    }

    // Only the active page mounts a native player; neighbours show the poster frame.
    return (
        <View style={{ width, height }}>
            {isActive ? (
                <VideoPlayer
                    uri={item.content_url}
                    posterUri={item.preview_url}
                    durationHint={item.duration}
                    isActive={isActive}
                    controlsVisible={controlsVisible}
                    onControlsVisibleChange={onControlsVisibleChange}
                    bottomOffset={videoBottomOffset}
                />
            ) : (
                <View style={styles.posterPage}>
                    <RemoteImage
                        uri={item.preview_url || item.thumbnail_url}
                        style={StyleSheet.absoluteFill}
                        resizeMode="contain"
                        placeholderColor="#000"
                        showErrorIcon={false}
                    />
                    <View style={styles.posterPlay}>
                        <Play size={30} color="#fff" fill="#fff" style={styles.posterPlayIcon} />
                    </View>
                </View>
            )}
        </View>
    );
});

// ─── Viewer content (mounted only while visible, so state resets on every open) ──

interface ContentProps extends Omit<Props, 'visible' | 'onClose'> {
    onRequestClose: () => void;
    indexRef: React.MutableRefObject<number>;
}

const ViewerContent = ({
    media,
    initialIndex,
    onRequestClose,
    indexRef,
    onMediaUpdated,
    onMediaDeleted,
}: ContentProps) => {
    const insets = useSafeAreaInsets();
    const listRef = useRef<FlatList<Media>>(null);

    const [size, setSize] = useState(() => {
        const { width, height } = Dimensions.get('window');
        return { width, height };
    });
    const [activeIndex, setActiveIndex] = useState(() =>
        Math.max(0, Math.min(initialIndex, media.length - 1)),
    );
    const [uiVisible, setUiVisible] = useState(true);
    const [zoomed, setZoomed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectAlbumVisible, setSelectAlbumVisible] = useState(false);
    const [infoVisible, setInfoVisible] = useState(false);

    const uiOpacity = useRef(new Animated.Value(1)).current;

    // Clamp when items get removed while the viewer is open.
    const safeIndex = Math.max(0, Math.min(activeIndex, media.length - 1));
    const currentItem: Media | undefined = media[safeIndex];

    useEffect(() => {
        indexRef.current = safeIndex;
    }, [safeIndex, indexRef]);

    useEffect(() => {
        if (media.length === 0) {
            onRequestClose();
        }
    }, [media.length, onRequestClose]);

    useEffect(() => {
        Animated.timing(uiOpacity, {
            toValue: uiVisible ? 1 : 0,
            duration: 180,
            useNativeDriver: true,
        }).start();
    }, [uiVisible, uiOpacity]);

    // Warm the image cache for the neighbours.
    useEffect(() => {
        const uris: string[] = [];
        for (const offset of [1, -1, 2]) {
            const m = media[safeIndex + offset];
            if (m) { uris.push(m.preview_url); }
        }
        prefetchImages(uris);
    }, [safeIndex, media]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    }, []);

    const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / size.width);
        setActiveIndex(prev => (prev === index ? prev : index));
        setZoomed(false);
    }, [size.width]);

    const toggleUi = useCallback(() => setUiVisible(v => !v), []);

    const getItemLayout = useCallback((_: ArrayLike<Media> | null | undefined, index: number) => ({
        length: size.width,
        offset: size.width * index,
        index,
    }), [size.width]);

    const keyExtractor = useCallback((item: Media) => item.id.toString(), []);

    const videoBottomOffset = insets.bottom + 96;

    const renderItem = useCallback(({ item, index }: { item: Media; index: number }) => (
        <ViewerPage
            item={item}
            isActive={index === safeIndex}
            width={size.width}
            height={size.height}
            controlsVisible={index === safeIndex && uiVisible}
            videoBottomOffset={videoBottomOffset}
            onTap={toggleUi}
            onControlsVisibleChange={setUiVisible}
            onZoomChange={setZoomed}
            onSwipeDown={onRequestClose}
        />
    ), [safeIndex, size.width, size.height, uiVisible, videoBottomOffset, toggleUi, onRequestClose]);

    // ── Actions ─────────────────────────────────────────────────────────────

    const handleDelete = () => {
        const item = currentItem;
        if (!item) { return; }

        Alert.alert('Move to Trash', 'Are you sure you want to move this to trash?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    setIsProcessing(true);
                    try {
                        await moveToTrash(item.id);
                        onMediaDeleted?.(item.id);
                        if (media.length <= 1) {
                            onRequestClose();
                        }
                    } catch {
                        Alert.alert('Error', 'Failed to delete media');
                    } finally {
                        setIsProcessing(false);
                    }
                },
            },
        ]);
    };

    const handleToggleFavorite = async () => {
        const item = currentItem;
        if (!item) { return; }
        // Optimistic update.
        onMediaUpdated?.({ ...item, is_favorite: !item.is_favorite });
        try {
            const updated = await toggleFavorite(item.id, !item.is_favorite);
            onMediaUpdated?.(updated);
        } catch {
            onMediaUpdated?.(item);
            Alert.alert('Error', 'Failed to update favorite status');
        }
    };

    const handleDownload = async () => {
        if (!currentItem) { return; }
        setIsProcessing(true);
        try {
            await downloadMediaToDevice(currentItem, true);
            ToastAndroid.show('Saved to device gallery!', ToastAndroid.SHORT);
        } catch {
            Alert.alert('Error', 'Failed to save file.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleShare = async () => {
        if (!currentItem) { return; }
        setIsProcessing(true);
        try {
            const uri = await downloadMediaToDevice(currentItem, false);
            await Share.open({ url: uri, type: currentItem.mime_type });
        } catch (e: any) {
            if (e?.message !== 'User did not share') {
                console.error('Share error:', e);
                Alert.alert('Error', 'Failed to share file: ' + String(e));
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCopyLink = async () => {
        if (!currentItem) { return; }
        setIsProcessing(true);
        try {
            const link = await createShareLink(currentItem.id);
            await RNShare.share({ message: link, title: 'Share Media' });
        } catch {
            Alert.alert('Error', 'Failed to create link.');
        } finally {
            setIsProcessing(false);
        }
    };

    const takenAt = currentItem ? mediaDate(currentItem) : null;
    const selectedAlbumIds = useMemo(() => (currentItem ? [currentItem.id] : []), [currentItem]);

    return (
        <GestureHandlerRootView style={styles.container} onLayout={onLayout}>
            <StatusBar hidden={!uiVisible} barStyle="light-content" animated />

            <FlatList
                ref={listRef}
                data={media}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed}
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={safeIndex}
                keyExtractor={keyExtractor}
                getItemLayout={getItemLayout}
                renderItem={renderItem}
                extraData={renderItem}
                onMomentumScrollEnd={onMomentumScrollEnd}
                windowSize={3}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                removeClippedSubviews
            />

            {/* Top bar */}
            <Animated.View
                style={[styles.topBar, { paddingTop: insets.top + 8, opacity: uiOpacity }]}
                pointerEvents={uiVisible ? 'auto' : 'none'}
            >
                <Pressable style={styles.actionButton} onPress={onRequestClose} hitSlop={15}>
                    <ArrowLeft size={24} color="white" />
                </Pressable>
                <View style={styles.titleBlock}>
                    {takenAt && (
                        <>
                            <Text style={styles.titleText} numberOfLines={1}>{formatDayTitle(takenAt)}</Text>
                            <Text style={styles.subtitleText} numberOfLines={1}>{formatTime(takenAt)}</Text>
                        </>
                    )}
                </View>
                <View style={styles.topRightActions}>
                    <Pressable style={styles.actionButton} onPress={handleToggleFavorite} hitSlop={15}>
                        <Heart
                            size={24}
                            color={currentItem?.is_favorite ? '#FF3B30' : 'white'}
                            fill={currentItem?.is_favorite ? '#FF3B30' : 'transparent'}
                        />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={handleCopyLink} disabled={isProcessing} hitSlop={15}>
                        <LinkIcon size={24} color="white" />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={() => setInfoVisible(true)} hitSlop={15}>
                        <MoreVertical size={24} color="white" />
                    </Pressable>
                </View>
            </Animated.View>

            {/* Bottom bar */}
            <Animated.View
                style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, opacity: uiOpacity }]}
                pointerEvents={uiVisible ? 'auto' : 'none'}
            >
                <Pressable style={styles.bottomActionButton} onPress={handleShare} disabled={isProcessing}>
                    <ShareIcon size={22} color="white" />
                    <Text style={styles.bottomActionText}>Share</Text>
                </Pressable>
                <Pressable style={styles.bottomActionButton} onPress={() => setSelectAlbumVisible(true)} disabled={isProcessing}>
                    <FolderPlus size={22} color="white" />
                    <Text style={styles.bottomActionText}>Add to</Text>
                </Pressable>
                <Pressable style={styles.bottomActionButton} onPress={handleDownload} disabled={isProcessing}>
                    <Download size={22} color="white" />
                    <Text style={styles.bottomActionText}>Save</Text>
                </Pressable>
                <Pressable style={styles.bottomActionButton} onPress={handleDelete} disabled={isProcessing}>
                    <Trash2 size={22} color="white" />
                    <Text style={styles.bottomActionText}>Delete</Text>
                </Pressable>
            </Animated.View>

            {isProcessing && (
                <View style={styles.processingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                </View>
            )}

            <SelectAlbumModal
                visible={selectAlbumVisible}
                mediaIds={selectedAlbumIds}
                onClose={() => setSelectAlbumVisible(false)}
            />

            {/* Info / Details sheet */}
            <Modal
                visible={infoVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setInfoVisible(false)}
            >
                <Pressable style={styles.infoOverlay} onPress={() => setInfoVisible(false)}>
                    <Pressable style={[styles.infoSheet, { paddingBottom: insets.bottom + 32 }]} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.infoDragHandle} />
                        <Text style={styles.infoTitle}>Details</Text>

                        <InfoRow label="Name" value={currentItem?.filename || 'Unknown'} />
                        <InfoRow
                            label="Date Taken"
                            value={takenAt ? `${takenAt.toLocaleDateString()} ${formatTime(takenAt)}` : 'Unknown'}
                        />
                        <InfoRow label="Size" value={formatBytes(currentItem?.file_size || 0)} />
                        <InfoRow
                            label="Resolution"
                            value={currentItem?.width && currentItem?.height ? `${currentItem.width} x ${currentItem.height}` : 'Unknown'}
                        />
                        {currentItem?.media_type === 'video' && (
                            <InfoRow label="Duration" value={formatDuration(currentItem.duration)} />
                        )}
                        <InfoRow label="Type" value={currentItem?.mime_type || currentItem?.media_type || 'Unknown'} />
                    </Pressable>
                </Pressable>
            </Modal>
        </GestureHandlerRootView>
    );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
);

// ─── Modal wrapper ──────────────────────────────────────────────────────────

const MediaViewer = ({ visible, media, initialIndex, onClose, onMediaUpdated, onMediaDeleted }: Props) => {
    const indexRef = useRef(initialIndex);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const handleClose = useCallback(() => {
        onCloseRef.current(indexRef.current);
    }, []);

    return (
        <Modal
            visible={visible}
            animationType="fade"
            presentationStyle="fullScreen"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            {visible && (
                <ViewerContent
                    media={media}
                    initialIndex={initialIndex}
                    indexRef={indexRef}
                    onRequestClose={handleClose}
                    onMediaUpdated={onMediaUpdated}
                    onMediaDeleted={onMediaDeleted}
                />
            )}
        </Modal>
    );
};

export default MediaViewer;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 10,
    },
    titleBlock: {
        flex: 1,
        marginHorizontal: 16,
    },
    titleText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    subtitleText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        marginTop: 1,
    },
    topRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    actionButton: {
        padding: 4,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 10,
    },
    bottomActionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 70,
    },
    bottomActionText: {
        color: 'white',
        fontSize: 12,
        marginTop: 6,
        fontWeight: '500',
    },
    posterPage: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    posterPlay: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    posterPlayIcon: {
        marginLeft: 4,
    },
    processingOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    infoOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    infoSheet: {
        backgroundColor: '#1c1c1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
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
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#333',
    },
    infoLabel: {
        fontSize: 16,
        color: '#8e8e93',
        marginRight: 16,
    },
    infoValue: {
        flexShrink: 1,
        fontSize: 16,
        color: '#fff',
        fontWeight: '500',
    },
});
