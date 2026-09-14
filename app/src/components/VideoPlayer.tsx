import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video, {
  OnBufferData,
  OnLoadData,
  OnProgressData,
  OnVideoErrorData,
  ReactVideoPoster,
  ReactVideoSource,
  VideoRef,
} from 'react-native-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react-native';

import { formatDuration } from '../utils/format';

const AUTO_HIDE_MS = 3000;
const PROGRESS_INTERVAL_MS = 250;

// Fast start: begin playback after ~1s of media is buffered instead of ExoPlayer's 2.5s default,
// and keep the forward buffer modest so memory/network stay low.
const BUFFER_CONFIG = {
  minBufferMs: 2500,
  maxBufferMs: 20000,
  bufferForPlaybackMs: 1000,
  bufferForPlaybackAfterRebufferMs: 1500,
};

// ─── Seek bar ───────────────────────────────────────────────────────────────

interface SeekBarProps {
  duration: number;
  progress: SharedValue<number>;
  onSeek: (time: number) => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  onScrubTime: (time: number) => void;
}

const SeekBar = ({ duration, progress, onSeek, onScrubbingChange, onScrubTime }: SeekBarProps) => {
  const barWidth = useSharedValue(0);
  const durationSV = useSharedValue(duration);
  const scrubbing = useSharedValue(false);
  const scrubTime = useSharedValue(0);
  const lastReported = useSharedValue(-1);

  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    barWidth.value = e.nativeEvent.layout.width;
  }, [barWidth]);

  const gesture = useMemo(() => {
    const timeAt = (x: number) => {
      'worklet';
      const w = barWidth.value;
      if (w <= 0) { return 0; }
      return (Math.min(1, Math.max(0, x / w))) * durationSV.value;
    };

    // Pan with minDistance(0) handles both tap-to-seek and drag scrubbing.
    return Gesture.Pan()
      .minDistance(0)
      .hitSlop({ top: 14, bottom: 14 })
      .onBegin(e => {
        if (durationSV.value <= 0) { return; }
        scrubbing.value = true;
        const t = timeAt(e.x);
        scrubTime.value = t;
        lastReported.value = Math.floor(t);
        scheduleOnRN(onScrubbingChange, true);
        scheduleOnRN(onScrubTime, t);
      })
      .onUpdate(e => {
        if (!scrubbing.value) { return; }
        const t = timeAt(e.x);
        scrubTime.value = t;
        if (Math.floor(t) !== lastReported.value) {
          lastReported.value = Math.floor(t);
          scheduleOnRN(onScrubTime, t);
        }
      })
      .onFinalize(() => {
        if (!scrubbing.value) { return; }
        scrubbing.value = false;
        progress.value = scrubTime.value;
        scheduleOnRN(onSeek, scrubTime.value);
        scheduleOnRN(onScrubbingChange, false);
      });
  }, [barWidth, durationSV, scrubbing, scrubTime, lastReported, progress, onSeek, onScrubbingChange, onScrubTime]);

  const fillStyle = useAnimatedStyle(() => {
    const d = durationSV.value;
    const t = scrubbing.value ? scrubTime.value : progress.value;
    const frac = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
    return { width: frac * barWidth.value };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const d = durationSV.value;
    const t = scrubbing.value ? scrubTime.value : progress.value;
    const frac = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
    return {
      transform: [
        { translateX: frac * barWidth.value - 7 },
        { scale: withTiming(scrubbing.value ? 1.4 : 1, { duration: 120 }) },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.seekHitArea} onLayout={onLayout}>
        <View style={styles.seekTrack} />
        <Animated.View style={[styles.seekFill, fillStyle]} />
        <Animated.View style={[styles.seekThumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
};

// ─── Player ─────────────────────────────────────────────────────────────────

interface Props {
  /** Signed `content_url` (no auth header needed, supports Range). */
  uri: string;
  /** Signed `preview_url` poster frame. */
  posterUri?: string | null;
  /** Duration known from the API, used until the player reports its own. */
  durationHint?: number | null;
  isActive: boolean;
  controlsVisible: boolean;
  onControlsVisibleChange: (visible: boolean) => void;
  /** Distance of the seek bar from the bottom of the screen (to sit above other chrome). */
  bottomOffset?: number;
}

const VideoPlayer = ({
  uri,
  posterUri,
  durationHint,
  isActive,
  controlsVisible,
  onControlsVisibleChange,
  bottomOffset = 24,
}: Props) => {
  const videoRef = useRef<VideoRef>(null);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [duration, setDuration] = useState(durationHint || 0);
  const [currentSecond, setCurrentSecond] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [interactionTick, setInteractionTick] = useState(0);

  const progress = useSharedValue(0);
  const controlsOpacity = useRef(new RNAnimated.Value(controlsVisible ? 1 : 0)).current;

  const source = useMemo<ReactVideoSource>(() => ({
    uri,
    bufferConfig: BUFFER_CONFIG,
    minLoadRetryCount: 3,
  }), [uri]);

  const poster = useMemo<ReactVideoPoster | undefined>(
    () => (posterUri ? { source: { uri: posterUri }, resizeMode: 'contain' } : undefined),
    [posterUri],
  );

  useEffect(() => {
    RNAnimated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, controlsOpacity]);

  // Pause when the page is no longer active.
  useEffect(() => {
    if (!isActive) {
      setPaused(true);
    }
  }, [isActive]);

  // Auto-hide controls 3s after the last interaction while playing.
  useEffect(() => {
    if (!controlsVisible || paused || scrubbing || !loaded || error) {
      return;
    }
    const t = setTimeout(() => onControlsVisibleChange(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [controlsVisible, paused, scrubbing, loaded, error, interactionTick, onControlsVisibleChange]);

  const touch = useCallback(() => setInteractionTick(n => n + 1), []);

  const handleLoad = useCallback((data: OnLoadData) => {
    setLoaded(true);
    setBuffering(false);
    setError(null);
    if (data.duration > 0) {
      setDuration(data.duration);
    }
  }, []);

  const handleBuffer = useCallback((data: OnBufferData) => {
    setBuffering(data.isBuffering);
  }, []);

  const handleProgress = useCallback((data: OnProgressData) => {
    progress.value = withTiming(data.currentTime, {
      duration: PROGRESS_INTERVAL_MS,
      easing: Easing.linear,
    });
    const sec = Math.floor(data.currentTime);
    setCurrentSecond(prev => (prev === sec ? prev : sec));
  }, [progress]);

  const handleEnd = useCallback(() => {
    setEnded(true);
    setPaused(true);
    onControlsVisibleChange(true);
  }, [onControlsVisibleChange]);

  const handleError = useCallback((e: OnVideoErrorData) => {
    console.log('VIDEO LOAD ERROR:', e?.error);
    const err = e?.error || {};
    setError(err.localizedDescription || err.errorString || err.error || 'Could not play this video');
    setBuffering(false);
    onControlsVisibleChange(true);
  }, [onControlsVisibleChange]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoaded(false);
    setBuffering(true);
    setEnded(false);
    setPaused(false);
    setRetryKey(k => k + 1);
  }, []);

  const togglePlay = useCallback(() => {
    touch();
    if (ended) {
      videoRef.current?.seek(0);
      progress.value = 0;
      setCurrentSecond(0);
      setEnded(false);
      setPaused(false);
      return;
    }
    setPaused(p => !p);
  }, [ended, progress, touch]);

  const toggleMute = useCallback(() => {
    touch();
    setMuted(m => !m);
  }, [touch]);

  const handleSeek = useCallback((time: number) => {
    videoRef.current?.seek(time);
    setCurrentSecond(Math.floor(time));
    if (ended && time < duration - 0.5) {
      setEnded(false);
    }
    touch();
  }, [duration, ended, touch]);

  const handleScrubTime = useCallback((time: number) => {
    setCurrentSecond(Math.floor(time));
  }, []);

  const handleSurfacePress = useCallback(() => {
    onControlsVisibleChange(!controlsVisible);
    touch();
  }, [controlsVisible, onControlsVisibleChange, touch]);

  const showSpinner = !error && !paused && (buffering || !loaded);

  return (
    <View style={styles.container}>
      <Video
        key={retryKey}
        ref={videoRef}
        source={source}
        poster={poster}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={paused || !isActive}
        muted={muted}
        repeat={false}
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
        progressUpdateInterval={PROGRESS_INTERVAL_MS}
        shutterColor="transparent"
        onLoad={handleLoad}
        onBuffer={handleBuffer}
        onProgress={handleProgress}
        onEnd={handleEnd}
        onError={handleError}
      />

      {/* Tap surface toggles controls */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleSurfacePress} />

      {showSpinner && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <RotateCcw size={18} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <RNAnimated.View
          style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
        >
          {!showSpinner && (
            <View style={styles.center} pointerEvents="box-none">
              <Pressable style={styles.playButton} onPress={togglePlay} hitSlop={10}>
                {ended ? (
                  <RotateCcw size={30} color="#fff" />
                ) : paused ? (
                  <Play size={30} color="#fff" fill="#fff" style={styles.playIcon} />
                ) : (
                  <Pause size={30} color="#fff" fill="#fff" />
                )}
              </Pressable>
            </View>
          )}

          <View style={[styles.bottomControls, { bottom: bottomOffset }]}>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatDuration(currentSecond)} / {formatDuration(duration)}
              </Text>
              <Pressable onPress={toggleMute} hitSlop={12} style={styles.muteButton}>
                {muted ? <VolumeX size={20} color="#fff" /> : <Volume2 size={20} color="#fff" />}
              </Pressable>
            </View>
            <SeekBar
              duration={duration}
              progress={progress}
              onSeek={handleSeek}
              onScrubbingChange={setScrubbing}
              onScrubTime={handleScrubTime}
            />
          </View>
        </RNAnimated.View>
      )}
    </View>
  );
};

export default React.memo(VideoPlayer);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    marginLeft: 4,
  },
  errorText: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 16,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a73e8',
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomControls: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  timeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  muteButton: {
    padding: 6,
  },
  seekHitArea: {
    height: 28,
    justifyContent: 'center',
  },
  seekTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
  seekThumb: {
    position: 'absolute',
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
  },
});
