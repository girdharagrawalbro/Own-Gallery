import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getMemories, getMediaStatuses } from '../api/media';
import MediaViewer from '../screens/Gallery/MediaViewer';
import { Media } from '../types/media';
import { useTheme } from '../context/ThemeContext';

export interface Memory {
    id: string;
    title: string;
    subtitle: string;
    cover_url: string | null;
    media_ids: number[];
}

const MemoriesCarousel = () => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const { data: memories = [], isLoading: loading } = useQuery<Memory[]>({
        queryKey: ['memories'],
        queryFn: () => getMemories(),
    });

    const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

    const { data: memoryMedia = [] } = useQuery<Media[]>({
        queryKey: ['memory-media', selectedMemory?.id],
        queryFn: () => getMediaStatuses(selectedMemory!.media_ids),
        enabled: !!selectedMemory && selectedMemory.media_ids.length > 0,
    });

    if (loading || memories.length === 0) return null;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {memories.map((memory) => (
                    <TouchableOpacity
                        key={memory.id}
                        style={[styles.card, { backgroundColor: colors.surfaceVariant }]}
                        activeOpacity={0.8}
                        onPress={() => {
                            setSelectedMemory(memory);
                        }}
                    >
                        {memory.cover_url && (
                            <Image source={{ uri: memory.cover_url }} style={styles.cover} />
                        )}
                        <View style={styles.overlay}>
                            <Text style={styles.subtitle}>{memory.subtitle}</Text>
                            <Text style={styles.name}>{memory.title}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <MediaViewer
                visible={!!selectedMemory && memoryMedia.length > 0}
                media={memoryMedia}
                initialIndex={0}
                onClose={() => setSelectedMemory(null)}
            />
        </View>
    );
};

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        paddingBottom: 12,
        backgroundColor: colors.surface,
    },
    scrollContent: {
        paddingHorizontal: 12,
        marginTop: 12,
        gap: 12,
    },
    card: {
        width: 140,
        height: 200,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: colors.surfaceVariant,
    },
    cover: {
        width: '100%',
        height: '100%',
    },
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
        paddingTop: 32,
    },
    subtitle: {
        fontSize: 11,
        color: '#fff',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
        opacity: 0.9,
    },
    name: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        lineHeight: 18,
    }
});

export default MemoriesCarousel;
