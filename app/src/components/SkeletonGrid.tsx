import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const GRID_GAP = 2;

interface Props {
  columns?: number;
  rows?: number;
}

/** Shimmering placeholder grid shown on first load. One shared native-driven animation. */
const SkeletonGrid = ({ columns = 3, rows = 8 }: Props) => {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const size = (width - GRID_GAP * (columns - 1)) / columns;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor: colors.background }]} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.row}>
          {Array.from({ length: columns }).map((__, c) => (
            <View
              key={c}
              style={[styles.cell, c > 0 && styles.cellGap, { width: size, height: size, backgroundColor: colors.surfaceVariant }]}
            />
          ))}
        </View>
      ))}
    </Animated.View>
  );
};

export default SkeletonGrid;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    marginBottom: GRID_GAP,
  },
  cell: {
    backgroundColor: '#e8eaed',
  },
  cellGap: {
    marginLeft: GRID_GAP,
  },
});
