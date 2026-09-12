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
import RNFS from 'react-native-fs';
import { ImageOff } from 'lucide-react-native';
import { getAccessToken } from '../storage/authStorage';

interface Props {
  uri: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}

const AuthenticatedImage = ({
  uri,
  style,
  containerStyle,
  resizeMode = 'cover',
}: Props) => {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const loadToken = async () => {
      try {
        const accessToken = await getAccessToken();
        if (isMounted && accessToken) {
          setToken(accessToken);
        }
      } catch (err) {
        if (isMounted) setError(true);
      }
    };

    if (uri) {
      loadToken();
    } else {
      setError(true);
    }

    return () => {
      isMounted = false;
    };
  }, [uri]);

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

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={{
          uri: uri,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }}
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