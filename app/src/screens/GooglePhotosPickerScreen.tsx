import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Check, CloudDownload } from 'lucide-react-native';
import RemoteImage from '../components/RemoteImage';
import { apiClient } from '../api/client';

const { width } = Dimensions.get('window');
const THUMB_SIZE = width / 4 - 2;

const fetchGooglePhotos = async (pageToken?: string) => {
    const res = await apiClient.get(`/auth/google/photos/${pageToken ? `?pageToken=${pageToken}` : ''}`);
    return res.data;
};

const importGooglePhotos = async (mediaItems: any[]) => {
    const res = await apiClient.post('/auth/google/import/', { mediaItems });
    return res.data;
};

const GooglePhotosPickerScreen = () => {
    const navigation = useNavigation();
    const [items, setItems] = useState<any[]>([]);
    const [nextPageToken, setNextPageToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const loadData = async (token?: string) => {
        setLoading(true);
        try {
            const data = await fetchGooglePhotos(token);
            setItems(prev => token ? [...prev, ...(data.mediaItems || [])] : (data.mediaItems || []));
            setNextPageToken(data.nextPageToken || null);
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to fetch photos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === items.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(items.map(i => i.id)));
        }
    };

    const handleImport = async () => {
        if (selectedIds.size === 0) return;
        setImporting(true);
        try {
            const selectedItems = items.filter(i => selectedIds.has(i.id));
            await importGooglePhotos(selectedItems);
            Alert.alert('Success', `Importing ${selectedIds.size} items in the background.`);
            setSelectedIds(new Set());
            navigation.goBack();
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to import photos.');
        } finally {
            setImporting(false);
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const selected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                onPress={() => toggleSelect(item.id)}
                style={styles.cell}
            >
                <RemoteImage uri={`${item.baseUrl}=w300-h300-c`} style={styles.image} />
                {selected && (
                    <View style={styles.selectedOverlay}>
                        <View style={styles.checkCircle}>
                            <Check size={16} color="#fff" />
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ArrowLeft size={24} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Select Photos</Text>
                <TouchableOpacity onPress={selectAll} style={styles.headerTextBtn}>
                    <Text style={styles.headerTextBtnLabel}>
                        {selectedIds.size === items.length && items.length > 0 ? 'Deselect All' : 'Select All'}
                    </Text>
                </TouchableOpacity>
            </View>

            {items.length === 0 && !loading && (
                <View style={styles.emptyState}>
                    <CloudDownload size={48} color="#9aa0a6" />
                    <Text style={styles.emptyTitle}>No Google Photos</Text>
                    <Text style={styles.emptyDesc}>We couldn't find any photos to import.</Text>
                </View>
            )}

            <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                numColumns={4}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 100 }}
                onEndReached={() => {
                    if (nextPageToken && !loading) {
                        loadData(nextPageToken);
                    }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => loading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
            />

            {selectedIds.size > 0 && (
                <View style={styles.bottomBar}>
                    <Text style={styles.selectedCount}>{selectedIds.size} selected</Text>
                    <TouchableOpacity
                        style={styles.importBtn}
                        onPress={handleImport}
                        disabled={importing}
                    >
                        {importing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.importBtnText}>Import</Text>}
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
};

export default GooglePhotosPickerScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: 56,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerBtn: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#000',
        flex: 1,
        marginLeft: 8,
    },
    headerTextBtn: {
        padding: 8,
    },
    headerTextBtnLabel: {
        fontSize: 14,
        color: '#1a73e8',
        fontWeight: '500',
    },
    cell: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        margin: 1,
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    selectedOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(255,255,255,0.4)',
        borderWidth: 3,
        borderColor: '#1a73e8',
        padding: 4,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#1a73e8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        color: '#3c4043',
    },
    emptyDesc: {
        fontSize: 14,
        color: '#5f6368',
        textAlign: 'center',
        marginTop: 8,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        right: 24,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    selectedCount: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
    },
    importBtn: {
        backgroundColor: '#1a73e8',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
    },
    importBtnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
});
