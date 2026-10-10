import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import RemoteImage from './RemoteImage';
import { getMedia } from '../api/media';
import { Media } from '../types/media';
import { useTheme } from '../context/ThemeContext';
import { hapticSelection } from '../utils/haptics';

const { width } = Dimensions.get('window');

interface PhotoPickerModalProps {
    visible: boolean;
    initiallySelected?: Media[];
    onClose: () => void;
    onConfirm: (items: Media[]) => void;
}

export const PhotoPickerModal: React.FC<PhotoPickerModalProps> = ({
    visible,
    initiallySelected = [],
    onClose,
    onConfirm,
}) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const [media, setMedia] = useState<Media[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected] = useState<Map<number, Media>>(new Map());
    
    const pageRef = useRef(1);
    const hasMoreRef = useRef(true);
    const busyRef = useRef(false);

    const fetchPage = useCallback(async (pageNumber: number) => {
        if (pageNumber > 1 && busyRef.current) return;
        busyRef.current = true;
        if (pageNumber === 1) setLoading(true); else setLoadingMore(true);
        try {
            const data = await getMedia({ page: pageNumber });
            setMedia(prev => (pageNumber === 1 ? data.results : [...prev, ...data.results]));
            pageRef.current = pageNumber;
            hasMoreRef.current = !!data.next;
        } catch (err) {
            console.error('Failed to fetch media', err);
        } finally {
            busyRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        if (!visible) return;
        fetchPage(1);
        setSelected(new Map(initiallySelected.map(m => [m.id, m])));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const toggle = (item: Media) => {
        hapticSelection();
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item);
            return next;
        });
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={[styles.pickerHeader, { backgroundColor: colors.surface }]}>
                    <Pressable onPress={onClose} style={styles.headerIconBtn}>
                        <Text style={{ color: colors.onSurface, fontSize: 16 }}>Cancel</Text>
                    </Pressable>
                    <Text style={[styles.pickerTitle, { flex: 1, textAlign: 'center' }]}>Select Photos</Text>
                    <Pressable 
                        onPress={() => onConfirm(Array.from(selected.values()))} 
                        style={[styles.headerIconBtn, { opacity: selected.size === 0 ? 0.5 : 1 }]}
                        disabled={selected.size === 0}
                    >
                        <Text style={{ color: colors.primary, fontSize: 16, fontWeight: 'bold' }}>
                            Add {selected.size > 0 ? `(${selected.size})` : ''}
                        </Text>
                    </Pressable>
                </View>
                {loading ? (
                    <View style={styles.centerFill}><ActivityIndicator size="large" color={colors.primary} /></View>
                ) : (
                    <FlatList
                        data={media}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={3}
                        onEndReached={() => hasMoreRef.current && fetchPage(pageRef.current + 1)}
                        onEndReachedThreshold={0.4}
                        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : null}
                        renderItem={({ item }) => {
                            const isSelected = selected.has(item.id);
                            return (
                                <Pressable style={styles.gridCell} onPress={() => toggle(item)}>
                                    <RemoteImage uri={item.thumbnail_url} style={styles.gridImage} />
                                    <View style={[styles.selectDot, isSelected && styles.selectDotActive]}>
                                        {isSelected && <Check size={14} color="#fff" />}
                                    </View>
                                </Pressable>
                            );
                        }}
                    />
                )}

            </SafeAreaView>
        </Modal>
    );
};

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pickerHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    pickerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
    headerIconBtn: { padding: 8 },
    gridCell: { width: width / 3, height: width / 3 },
    gridImage: { width: '100%', height: '100%' },
    selectDot: {
        position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12,
        borderWidth: 2, borderColor: colors.surface, backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    selectDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
