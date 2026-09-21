import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { getMemories } from '../api/media';

export interface Memory {
    id: string;
    title: string;
    subtitle: string;
    cover_url: string | null;
    media_ids: number[];
}

const MemoriesCarousel = () => {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMemories()
            .then(setMemories)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading || memories.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <Sparkles size={18} color="#202124" />
                    <Text style={styles.title}>Memories</Text>
                </View>
                <TouchableOpacity>
                    <Text style={styles.viewAll}>View all</Text>
                </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {memories.map((memory) => (
                    <TouchableOpacity key={memory.id} style={styles.card} activeOpacity={0.8}>
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#202124',
    },
    viewAll: {
        fontSize: 14,
        fontWeight: '500',
        color: '#1a73e8',
    },
    scrollContent: {
        paddingHorizontal: 12,
        gap: 12,
    },
    card: {
        width: 140,
        height: 200,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#f1f3f4',
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
