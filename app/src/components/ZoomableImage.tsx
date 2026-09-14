import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import RemoteImage from './RemoteImage';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_DOWN_DISTANCE = 120;
const SWIPE_DOWN_VELOCITY = 900;
const TOUCH_SLOP = 10;

// Pan modes decided at activation time.
const PAN_NONE = 0;
const PAN_ZOOMED = 1;
const PAN_DISMISS = 2;

interface Props {
  /** Small image rendered immediately underneath. */
  thumbnailUri?: string | null;
  /** Full-screen quality image faded in on top when loaded. */
  previewUri?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  /** Page size (the viewport the image is fitted into). */
  width: number;
  height: number;
  isActive: boolean;
  onTap?: () => void;
  /** Called when zoom state flips (so the pager can disable scrolling while zoomed). */
  onZoomChange?: (zoomed: boolean) => void;
  /** Swipe down while not zoomed. */
  onSwipeDown?: () => void;
}

const ZoomableImage = ({
  thumbnailUri,
  previewUri,
  mediaWidth,
  mediaHeight,
  width: screenW,
  height: screenH,
  isActive,
  onTap,
  onZoomChange,
  onSwipeDown,
}: Props) => {

  // Size of the image as displayed with resizeMode="contain" at scale 1.
  const { contentW, contentH } = useMemo(() => {
    if (mediaWidth && mediaHeight && mediaWidth > 0 && mediaHeight > 0) {
      const aspect = mediaWidth / mediaHeight;
      const w = Math.min(screenW, screenH * aspect);
      return { contentW: w, contentH: w / aspect };
    }
    return { contentW: screenW, contentH: screenH };
  }, [mediaWidth, mediaHeight, screenW, screenH]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const dismissY = useSharedValue(0);

  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  const panMode = useSharedValue(PAN_NONE);
  const panBaseX = useSharedValue(0);
  const panBaseY = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);

  const cx = screenW / 2;
  const cy = screenH / 2;

  // Reset whenever the page stops being the active one.
  useEffect(() => {
    if (!isActive) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedX.value = 0;
      savedY.value = 0;
      dismissY.value = 0;
    }
  }, [isActive, scale, savedScale, translateX, translateY, savedX, savedY, dismissY]);

  // Notify JS only when crossing the zoomed / not-zoomed boundary.
  useAnimatedReaction(
    () => scale.value > 1.01,
    (zoomed, prev) => {
      if (prev !== null && zoomed !== prev && onZoomChange) {
        scheduleOnRN(onZoomChange, zoomed);
      }
    },
    [onZoomChange],
  );

  const gesture = useMemo(() => {
    const maxX = (s: number) => {
      'worklet';
      return Math.max(0, (contentW * s - screenW) / 2);
    };
    const maxY = (s: number) => {
      'worklet';
      return Math.max(0, (contentH * s - screenH) / 2);
    };
    const clamp = (v: number, bound: number) => {
      'worklet';
      return Math.min(bound, Math.max(-bound, v));
    };

    const pinch = Gesture.Pinch()
      .onStart(e => {
        savedScale.value = scale.value;
        savedX.value = translateX.value;
        savedY.value = translateY.value;
        pinchFocalX.value = e.focalX;
        pinchFocalY.value = e.focalY;
      })
      .onUpdate(e => {
        const next = Math.min(MAX_SCALE * 1.2, Math.max(0.7, savedScale.value * e.scale));
        const ratio = next / savedScale.value;
        scale.value = next;
        // Keep the content point under the fingers fixed (and follow focal movement).
        translateX.value = e.focalX - cx - ratio * (pinchFocalX.value - cx - savedX.value);
        translateY.value = e.focalY - cy - ratio * (pinchFocalY.value - cy - savedY.value);
      })
      .onEnd(() => {
        if (scale.value <= 1) {
          scale.value = withTiming(1);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          savedScale.value = 1;
          savedX.value = 0;
          savedY.value = 0;
          return;
        }
        const s = Math.min(scale.value, MAX_SCALE);
        const tx = clamp(translateX.value, maxX(s));
        const ty = clamp(translateY.value, maxY(s));
        scale.value = withTiming(s);
        translateX.value = withTiming(tx);
        translateY.value = withTiming(ty);
        savedScale.value = s;
        savedX.value = tx;
        savedY.value = ty;
      });

    // Pan only activates while zoomed (or for a clearly vertical swipe-down),
    // otherwise it fails so the horizontal pager keeps working.
    const pan = Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown(e => {
        if (e.allTouches.length > 0) {
          touchStartX.value = e.allTouches[0].absoluteX;
          touchStartY.value = e.allTouches[0].absoluteY;
        }
        panMode.value = PAN_NONE;
      })
      .onTouchesMove((e, manager) => {
        if (panMode.value !== PAN_NONE || e.allTouches.length === 0) {
          return;
        }
        if (scale.value > 1.01) {
          panMode.value = PAN_ZOOMED;
          manager.activate();
          return;
        }
        if (e.allTouches.length > 1) {
          // Let pinch handle multi-touch.
          return;
        }
        const dx = e.allTouches[0].absoluteX - touchStartX.value;
        const dy = e.allTouches[0].absoluteY - touchStartY.value;
        if (onSwipeDown && dy > TOUCH_SLOP && Math.abs(dy) > Math.abs(dx) * 1.5) {
          panMode.value = PAN_DISMISS;
          manager.activate();
        } else if (Math.abs(dx) > TOUCH_SLOP || dy < -TOUCH_SLOP) {
          manager.fail();
        }
      })
      .onStart(() => {
        panBaseX.value = translateX.value;
        panBaseY.value = translateY.value;
      })
      .onUpdate(e => {
        if (panMode.value === PAN_ZOOMED) {
          if (e.numberOfPointers > 1) {
            // Pinch owns the transform; rebase so a later one-finger pan continues smoothly.
            panBaseX.value = translateX.value - e.translationX;
            panBaseY.value = translateY.value - e.translationY;
            return;
          }
          translateX.value = panBaseX.value + e.translationX;
          translateY.value = panBaseY.value + e.translationY;
        } else if (panMode.value === PAN_DISMISS) {
          dismissY.value = Math.max(0, e.translationY);
        }
      })
      .onEnd(e => {
        if (panMode.value === PAN_ZOOMED) {
          const s = scale.value;
          const bx = maxX(s);
          const by = maxY(s);
          translateX.value = withDecay({ velocity: e.velocityX, clamp: [-bx, bx] });
          translateY.value = withDecay({ velocity: e.velocityY, clamp: [-by, by] });
        } else if (panMode.value === PAN_DISMISS) {
          if ((e.translationY > SWIPE_DOWN_DISTANCE || e.velocityY > SWIPE_DOWN_VELOCITY) && onSwipeDown) {
            scheduleOnRN(onSwipeDown);
          } else {
            dismissY.value = withSpring(0, { damping: 20, stiffness: 200 });
          }
        }
      })
      .onFinalize(() => {
        panMode.value = PAN_NONE;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .maxDistance(TOUCH_SLOP)
      .onEnd((e, success) => {
        if (!success) { return; }
        if (scale.value > 1.01) {
          scale.value = withTiming(1);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          savedScale.value = 1;
          savedX.value = 0;
          savedY.value = 0;
        } else {
          const s = DOUBLE_TAP_SCALE;
          // Zoom so that the tapped point stays under the finger.
          const tx = clamp((e.x - cx) * (1 - s), maxX(s));
          const ty = clamp((e.y - cy) * (1 - s), maxY(s));
          scale.value = withTiming(s);
          translateX.value = withTiming(tx);
          translateY.value = withTiming(ty);
          savedScale.value = s;
          savedX.value = tx;
          savedY.value = ty;
        }
      });

    const singleTap = Gesture.Tap()
      .maxDistance(TOUCH_SLOP)
      .maxDuration(300)
      .onEnd((_e, success) => {
        if (success && onTap) {
          scheduleOnRN(onTap);
        }
      });

    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    contentW, contentH, screenW, screenH, cx, cy, onTap, onSwipeDown,
    scale, savedScale, translateX, translateY, savedX, savedY, dismissY,
    pinchFocalX, pinchFocalY, panMode, panBaseX, panBaseY, touchStartX, touchStartY,
  ]);

  const imageStyle = useAnimatedStyle(() => {
    const dragScale = 1 - Math.min(dismissY.value / (screenH * 2), 0.25);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value + dismissY.value },
        { scale: scale.value * dragScale },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.container, { width: screenW, height: screenH }]}>
        <Animated.View style={[{ width: screenW, height: screenH }, imageStyle]}>
          <RemoteImage
            uri={thumbnailUri}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            placeholderColor="transparent"
            fadeDuration={0}
            showErrorIcon={false}
          />
          <RemoteImage
            uri={previewUri}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            placeholderColor="transparent"
            fadeDuration={200}
            showErrorIcon={!thumbnailUri}
            errorIconSize={40}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

export default React.memo(ZoomableImage);

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
