import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import AuthenticatedImage from './AuthenticatedImage';

const { width, height } = Dimensions.get('window');

const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Props {
  uri: string;
  isActive: boolean;
}

const ZoomableImage = ({ uri, isActive }: Props) => {
  // ── Scale ────────────────────────────────────────────────────────────────
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  // ── Translation ──────────────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const resetZoom = (animated = true) => {
    'worklet';
    scale.value = animated ? withTiming(1) : 1;
    savedScale.value = 1;
    translateX.value = animated ? withTiming(0) : 0;
    translateY.value = animated ? withTiming(0) : 0;
    savedX.value = 0;
    savedY.value = 0;
  };

  React.useEffect(() => {
    if (!isActive) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedX.value = 0;
      savedY.value = 0;
    }
  }, [isActive, scale, savedScale, translateX, translateY, savedX, savedY]);

  // ── Pinch gesture ────────────────────────────────────────────────────────
  const pinchGesture = Gesture.Pinch()
    .onUpdate(event => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
      }
    });

  // ── Pan gesture (only active while zoomed) ───────────────────────────────
  const panGesture = Gesture.Pan()
    .onUpdate(event => {
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  // ── Double-tap gesture ───────────────────────────────────────────────────
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom();
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  // ── Compose: pinch + pan run simultaneously; double-tap is exclusive ─────
  const composed = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture,
  );

  // ── Animated style ───────────────────────────────────────────────────────
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={styles.container}>
        <Animated.View style={animatedStyle}>
          <AuthenticatedImage
            uri={uri}
            style={styles.image}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

export default ZoomableImage;

const styles = StyleSheet.create({
  container: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  image: {
    width,
    height,
  },
});
