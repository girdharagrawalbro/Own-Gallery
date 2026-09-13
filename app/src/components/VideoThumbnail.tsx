import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Film, Play } from 'lucide-react-native';
import AuthenticatedImage from './AuthenticatedImage';

interface Props {
  thumbnailUrl: string | null;
  duration: number | null; // seconds
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const VideoThumbnail = ({ thumbnailUrl, duration }: Props) => {
  return (
    <View style={styles.container}>
      {thumbnailUrl ? (
        <AuthenticatedImage
          uri={thumbnailUrl}
          style={styles.image}
          resizeMode="cover"
          cacheOnDisk={true}
        />
      ) : (
        <View style={styles.noThumb}>
          <Film size={24} color="#ccc" />
        </View>
      )}

      {/* Play indicator overlay */}
      <View style={styles.overlay}>
        <View style={styles.playBadge}>
          <Play size={12} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
        </View>
      </View>

      {/* Duration badge */}
      {duration != null && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            {formatDuration(duration)}
          </Text>
        </View>
      )}
    </View>
  );
};

export default VideoThumbnail;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noThumb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  noThumbIcon: {
    fontSize: 28,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 11,
    marginLeft: 2,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});
