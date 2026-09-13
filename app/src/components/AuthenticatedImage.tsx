import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ImageOff } from 'lucide-react-native';
import { getAccessToken } from '../storage/authStorage';
import { ImageCacheManager } from '../utils/ImageCacheManager';

interface Props {
  uri: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  cacheOnDisk?: boolean;
}

const AuthenticatedImage = ({
  uri,
  style,
  containerStyle,
  resizeMode = 'cover',
  cacheOnDisk = false,
}: Props) => {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadTokenAndImage = async () => {
      try {
        const accessToken = await getAccessToken();
        if (isMounted && accessToken) {
          setToken(accessToken);
          
          if (cacheOnDisk && uri) {
            try {
              const cachedUri = await ImageCacheManager.getCachedImage(uri, accessToken);
              if (isMounted) setLocalUri(cachedUri);
            } catch (cacheErr) {
              // Fallback to network rendering if caching fails
              console.warn('Caching failed, falling back to network stream', cacheErr);
            }
          }
        }
      } catch (err) {
        if (isMounted) setError(true);
      }
    };

    if (uri) {
      loadTokenAndImage();
    } else {
      setError(true);
    }

    return () => {
      isMounted = false;
    };
  }, [uri, cacheOnDisk]);

  if (!token && !error) {
    return (
      <View style={[styles.container, containerStyle]}>
        <ActivityIndicator color="#007AFF" />
      </View>
    );
  }

  if (error || !uri) {
    return (
      <View style={[styles.container, containerStyle, styles.errorContainer]}>
        <ImageOff size={24} color="#ccc" />
      </View>
    );
  }

  const imageSource = localUri 
    ? { uri: localUri } 
    : { uri: uri, headers: { Authorization: `Bearer ${token}` } };

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={imageSource}
        style={style}
        resizeMode={resizeMode}
        onError={() => setError(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
  }
});

export default React.memo(AuthenticatedImage);