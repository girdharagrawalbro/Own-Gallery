import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';

export const GRID_GAP = 2;

interface Props {
  columns?: number;
  rows?: number;
}

/** Shimmering placeholder grid shown on first load. One shared native-driven animation. */
const SkeletonGrid = ({ columns = 3, rows = 8 }: Props) => {
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
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <View style={styles.headerBar} />
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.row}>
          {Array.from({ length: columns }).map((__, c) => (
            <View
              key={c}
              style={[styles.cell, c > 0 && styles.cellGap, { width: size, height: size }]}
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
    flex: 1,
    backgroundColor: '#fff',
  },
  headerBar: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#e8eaed',
    marginHorizontal: 16,
    marginVertical: 19,
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
