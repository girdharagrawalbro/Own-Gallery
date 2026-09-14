import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { ImageOff } from 'lucide-react-native';

interface Props {
  /** Signed absolute URL. Rendered directly; native image cache (Fresco / SDWebImage) does the rest. */
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Background shown until the image is decoded. */
  placeholderColor?: string;
  /** Duration of the fade-in once loaded (skipped for images that come straight from memory cache). */
  fadeDuration?: number;
  showErrorIcon?: boolean;
  errorIconSize?: number;
  onLoad?: () => void;
}

// Images that finish loading this quickly came from the memory cache: don't fade them.
const INSTANT_LOAD_MS = 50;

const RemoteImage = ({
  uri,
  style,
  imageStyle,
  resizeMode = 'cover',
  placeholderColor = '#f1f3f4',
  fadeDuration = 180,
  showErrorIcon = true,
  errorIconSize = 22,
  onLoad,
}: Props) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(Date.now());
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    opacity.setValue(0);
  }, [uri, opacity]);

  const handleLoad = useCallback(() => {
    if (Date.now() - startedAt.current < INSTANT_LOAD_MS || fadeDuration <= 0) {
      opacity.setValue(1);
    } else {
      Animated.timing(opacity, {
        toValue: 1,
        duration: fadeDuration,
        useNativeDriver: true,
      }).start();
    }
    onLoad?.();
  }, [fadeDuration, onLoad, opacity]);

  const handleError = useCallback(() => {
    setFailedUri(uri ?? null);
  }, [uri]);

  const failed = !uri || failedUri === uri;

  return (
    <View style={[styles.container, { backgroundColor: placeholderColor }, style]}>
      {!failed && (
        <Animated.Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, imageStyle, { opacity }]}
          resizeMode={resizeMode}
          fadeDuration={0}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {failed && showErrorIcon && (
        <View style={styles.errorContainer}>
          <ImageOff size={errorIconSize} color="#9AA0A6" />
        </View>
      )}
    </View>
  );
};

/** Warm the native image cache for a few upcoming URLs (e.g. neighbours in the viewer). */
export const prefetchImages = (() => {
  const seen = new Set<string>();
  return (uris: Array<string | null | undefined>) => {
    for (const u of uris) {
      if (!u || seen.has(u)) { continue; }
      if (seen.size > 500) {
        seen.clear();
      }
      seen.add(u);
      Image.prefetch(u).catch(() => {
        seen.delete(u);
      });
    }
  };
})();

export default React.memo(RemoteImage);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  errorContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
