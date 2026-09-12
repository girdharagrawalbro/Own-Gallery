import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  Dimensions,
  Pressable,
  Text,
} from 'react-native';
import { Play } from 'lucide-react-native';
import Video, { OnProgressData } from 'react-native-video';
import { getAccessToken } from '../storage/authStorage';

const { width, height } = Dimensions.get('window');

interface Props {
  uri: string;
  isActive: boolean;
}

const VideoPlayer = ({ uri, isActive }: Props) => {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const videoRef = useRef<any>(null);

  useEffect(() => {
    const loadToken = async () => {
      const accessToken = await getAccessToken();
      setToken(accessToken);
    };

    loadToken();
  }, []);

  const togglePause = () => {
    setPaused(!paused);
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.videoContainer} onPress={togglePause}>
        <Video
          ref={videoRef}
          source={{
            uri,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }}
          style={styles.video}
          resizeMode="contain"
          paused={paused || !isActive}
          onLoadStart={() => {
            setLoading(true);
            setError(false);
          }}
          onLoad={(data) => {
            setLoading(false);
            setDuration(data.duration);
          }}
          onProgress={(data: OnProgressData) => {
            setProgress(data.currentTime);
          }}
          onError={(e) => {
            console.log('VIDEO LOAD ERROR:', e);
            setLoading(false);
            setError(true);
          }}
          repeat
        />

        {loading && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}

        {error && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>Failed to load video</Text>
          </View>
        )}

        {paused && !loading && !error && (
          <View style={styles.overlay}>
            <View style={styles.playButton}>
              <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}
      </Pressable>

      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }]} />
      </View>
    </View>
  );
};

export default VideoPlayer;

const styles = StyleSheet.create({
  container: {
    width,
    height,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
  },
});
