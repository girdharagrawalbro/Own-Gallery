import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  ListViewToken,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { AlertCircle, Check, Heart, Play } from 'lucide-react-native';

import RemoteImage from './RemoteImage';
import SkeletonGrid, { GRID_GAP } from './SkeletonGrid';
import { Media } from '../types/media';
import { dayKey, formatDayTitle, formatDuration, mediaDate } from '../utils/format';

const HEADER_HEIGHT = 52;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;
const DEFAULT_COLUMNS = 3;
const COLUMNS_KEY = '@grid_columns';

// ─── Column count (pinch-to-zoom), persisted ────────────────────────────────

let cachedColumns: number | null = null;
const columnListeners = new Set<(n: number) => void>();

const clampColumns = (n: number) => Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, n));

export const useGridColumns = (): [number, (n: number) => void] => {
  const [columns, setColumnsState] = useState(cachedColumns ?? DEFAULT_COLUMNS);

  useEffect(() => {
    columnListeners.add(setColumnsState);
    if (cachedColumns === null) {
      AsyncStorage.getItem(COLUMNS_KEY)
        .then(v => {
          const parsed = v ? parseInt(v, 10) : NaN;
          cachedColumns = isNaN(parsed) ? DEFAULT_COLUMNS : clampColumns(parsed);
          columnListeners.forEach(l => l(cachedColumns as number));
        })
        .catch(() => {});
    }
    return () => {
      columnListeners.delete(setColumnsState);
    };
  }, []);

  const setColumns = useCallback((n: number) => {
    const next = clampColumns(n);
    cachedColumns = next;
    columnListeners.forEach(l => l(next));
    AsyncStorage.setItem(COLUMNS_KEY, String(next)).catch(() => {});
  }, []);

  return [columns, setColumns];
};

// ─── List model ─────────────────────────────────────────────────────────────

type HeaderItem = { type: 'header'; key: string; title: string; ids: number[] };
type RowItem = { type: 'row'; key: string; items: Media[]; height: number; widths: number[] };
type ListItem = HeaderItem | RowItem;

const buildRows = (items: Media[], columns: number, out: ListItem[], screenWidth: number, gap: number) => {
  const targetAspectRatioSum = columns;
  let currentRow: { media: Media; ar: number }[] = [];
  let currentAspectRatioSum = 0;

  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    let ar = 1;
    if (m.width && m.height) {
      ar = m.width / m.height;
      // Clamp aspect ratios to prevent extreme sizing
      if (ar < 0.5) ar = 0.5;
      if (ar > 3) ar = 3;
    }
    currentRow.push({ media: m, ar });
    currentAspectRatioSum += ar;

    // Finish row if it meets/exceeds the target, or if it's the last item
    if (currentAspectRatioSum >= targetAspectRatioSum || i === items.length - 1) {
      const gapsWidth = (currentRow.length - 1) * gap;
      const availableWidth = screenWidth - gapsWidth;
      
      let rowHeight = availableWidth / currentAspectRatioSum;
      
      // If it's the last row and it's not "full", don't stretch it to fill
      if (i === items.length - 1 && currentAspectRatioSum < targetAspectRatioSum * 0.8) {
        rowHeight = screenWidth / targetAspectRatioSum; // Use a standard height instead of stretching
      }

      // Constrain row height bounds
      const minRowHeight = 60;
      const maxRowHeight = screenWidth * 0.8;
      rowHeight = Math.max(minRowHeight, Math.min(rowHeight, maxRowHeight));

      out.push({
        type: 'row',
        key: `row-${currentRow[0].media.id}`,
        items: currentRow.map(r => r.media),
        height: rowHeight,
        widths: currentRow.map(r => rowHeight * r.ar),
      });

      currentRow = [];
      currentAspectRatioSum = 0;
    }
  }
};

// ─── Cell ───────────────────────────────────────────────────────────────────

interface CellProps {
  item: Media;
  width: number;
  height: number;
  isFirst: boolean;
  selected: boolean;
  disabled: boolean;
  selectionMode: boolean;
  showFavoriteBadge: boolean;
  renderCellOverlay?: (item: Media) => React.ReactNode;
  onPress: (item: Media) => void;
  onLongPress: (item: Media) => void;
}

const GridCell = React.memo(({
  item,
  width,
  height,
  isFirst,
  selected,
  disabled,
  selectionMode,
  showFavoriteBadge,
  renderCellOverlay,
  onPress,
  onLongPress,
}: CellProps) => {
  const scale = useRef(new RNAnimated.Value(selected ? 0.86 : 1)).current;
  const prevSelected = useRef(selected);

  useEffect(() => {
    if (prevSelected.current === selected) { return; }
    prevSelected.current = selected;
    RNAnimated.spring(scale, {
      toValue: selected ? 0.86 : 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }, [selected, scale]);

  const isProcessing = item.status === 'processing';
  const isFailed = item.status === 'failed';
  const compact = height < 90;

  return (
    <Pressable
      style={[styles.cell, !isFirst && styles.cellGap, { width, height }]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={300}
    >
      <RNAnimated.View
        style={[
          styles.cellInner,
          selected && styles.cellInnerSelected,
          { transform: [{ scale }] },
        ]}
      >
        <RemoteImage
          uri={item.thumbnail_url}
          style={StyleSheet.absoluteFill}
          showErrorIcon={!isProcessing}
        />

        {item.media_type === 'video' && (
          <View style={styles.videoBadge}>
            {!compact && item.duration != null && (
              <Text style={styles.videoBadgeText}>{formatDuration(item.duration)}</Text>
            )}
            <Play size={compact ? 10 : 12} color="#fff" fill="#fff" />
          </View>
        )}

        {showFavoriteBadge && item.is_favorite && !selectionMode && (
          <View style={styles.favoriteBadge}>
            <Heart size={compact ? 12 : 15} color="#fff" fill="#fff" />
          </View>
        )}

        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}

        {isFailed && (
          <View style={styles.failedBadge}>
            <AlertCircle size={compact ? 14 : 18} color="#fff" fill="#d93025" />
          </View>
        )}

        {renderCellOverlay?.(item)}

        {disabled && <View style={styles.disabledOverlay} />}
      </RNAnimated.View>

      {selectionMode && (
        <View style={styles.selectionOverlay} pointerEvents="none">
          {selected || disabled ? (
            <View style={[styles.checkBadge, disabled && styles.checkBadgeDisabled]}>
              <Check size={13} color="#fff" strokeWidth={3} />
            </View>
          ) : (
            <View style={styles.uncheckedBadge} />
          )}
        </View>
      )}
    </Pressable>
  );
});

// ─── Row & header ───────────────────────────────────────────────────────────

interface RowProps {
  items: Media[];
  /** '1'/'0' per item; a string so React.memo can compare cheaply */
  selKey: string;
  disKey: string;
  height: number;
  widths: number[];
  selectionMode: boolean;
  showFavoriteBadge: boolean;
  renderCellOverlay?: (item: Media) => React.ReactNode;
  onPress: (item: Media) => void;
  onLongPress: (item: Media) => void;
}

const GridRow = React.memo(({
  items,
  selKey,
  disKey,
  height,
  widths,
  selectionMode,
  showFavoriteBadge,
  renderCellOverlay,
  onPress,
  onLongPress,
}: RowProps) => (
  <View style={[styles.row, { height: height + GRID_GAP }]}>
    {items.map((item, i) => (
      <GridCell
        key={item.id}
        item={item}
        width={widths[i]}
        height={height}
        isFirst={i === 0}
        selected={selKey[i] === '1'}
        disabled={disKey[i] === '1'}
        selectionMode={selectionMode}
        showFavoriteBadge={showFavoriteBadge}
        renderCellOverlay={renderCellOverlay}
        onPress={onPress}
        onLongPress={onLongPress}
      />
    ))}
  </View>
));

interface HeaderProps {
  title: string;
  ids: number[];
  allSelected: boolean;
  showCheckbox: boolean;
  onToggle: (ids: number[]) => void;
}

const GridHeader = React.memo(({ title, ids, allSelected, showCheckbox, onToggle }: HeaderProps) => (
  <View style={styles.header}>
    <Text style={styles.headerText} numberOfLines={1}>{title}</Text>
    {showCheckbox && (
      <Pressable onPress={() => onToggle(ids)} hitSlop={12} style={styles.headerCheckBtn}>
        <View style={[styles.headerCheck, allSelected && styles.headerCheckActive]}>
          {allSelected && <Check size={14} color="#fff" strokeWidth={3} />}
        </View>
      </Pressable>
    )}
  </View>
));

// ─── Grid ───────────────────────────────────────────────────────────────────

export interface MediaGridHandle {
  /** Scrolls so that the given media item is visible (no-op if it already is). */
  scrollToMedia: (id: number) => void;
}

export interface MediaGridProps {
  media: Media[];
  groupByDate?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<number>;
  /** Items shown as already-selected and not selectable (e.g. already in album). */
  disabledIds?: Set<number>;
  onPressItem?: (item: Media, index: number) => void;
  onLongPressItem?: (item: Media, index: number) => void;
  /** Header checkbox (visible in selection mode) toggles a whole day. */
  onToggleGroup?: (ids: number[]) => void;
  showFavoriteBadge?: boolean;
  /** Must be a stable (memoized) function. */
  renderCellOverlay?: (item: Media) => React.ReactNode;
  pinchToZoom?: boolean;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
  ListEmptyComponent?: React.ReactElement;
  ListHeaderComponent?: React.ReactElement;
  bottomPadding?: number;
  onScroll?: (event: any) => void;
  ref?: React.Ref<MediaGridHandle>;
}

const EMPTY_SET = new Set<number>();

const MediaGrid = ({
  media,
  groupByDate = true,
  selectionMode = false,
  selectedIds = EMPTY_SET,
  disabledIds = EMPTY_SET,
  onPressItem,
  onLongPressItem,
  onToggleGroup,
  showFavoriteBadge = true,
  renderCellOverlay,
  pinchToZoom = true,
  loading = false,
  refreshing = false,
  onRefresh,
  onEndReached,
  loadingMore = false,
  ListEmptyComponent,
  ListHeaderComponent,
  bottomPadding = 100,
  onScroll,
  ref,
}: MediaGridProps) => {
  const { width, height } = useWindowDimensions();
  const [columns, setColumns] = useGridColumns();
  const listRef = useRef<FlatList<ListItem>>(null);

  // Build rows + dynamic layout offsets in one pass.
  const { listData, offsets, rowKeyById, indexById } = useMemo(() => {
    const data: ListItem[] = [];
    const idx = new Map<number, number>();
    media.forEach((m, i) => idx.set(m.id, i));

    if (groupByDate) {
      let currentKey: string | null = null;
      let bucket: Media[] = [];
      const now = new Date();
      const flush = () => {
        if (bucket.length === 0) { return; }
        const d = mediaDate(bucket[0]);
        let locationStr = '';
        const locations = bucket.map(m => m.location_name).filter(Boolean);
        if (locations.length > 0) {
          locationStr = locations[0].split(',')[0];
        }
        data.push({
          type: 'header',
          key: `header-${currentKey}`,
          title: formatDayTitle(d, now) + (locationStr ? ` · ${locationStr}` : ''),
          ids: bucket.map(m => m.id),
        });
        buildRows(bucket, columns, data, width, GRID_GAP);
      };
      for (const m of media) {
        const k = dayKey(mediaDate(m));
        if (k !== currentKey) {
          flush();
          currentKey = k;
          bucket = [];
        }
        bucket.push(m);
      }
      flush();
    } else {
      buildRows(media, columns, data, width, GRID_GAP);
    }

    const offs: number[] = new Array(data.length + 1);
    const rowKeys = new Map<number, number>();
    let y = 0;
    data.forEach((item, i) => {
      offs[i] = y;
      if (item.type === 'header') {
        y += HEADER_HEIGHT;
      } else {
        item.items.forEach(m => rowKeys.set(m.id, i));
        y += item.height + GRID_GAP;
      }
    });
    offs[data.length] = y;

    return { listData: data, offsets: offs, rowKeyById: rowKeys, indexById: idx };
  }, [media, columns, groupByDate, width]);

  // Stable callbacks: the latest props are read through a ref so rows never re-render for them.
  const latest = useRef({ onPressItem, onLongPressItem, onToggleGroup, indexById });
  latest.current = { onPressItem, onLongPressItem, onToggleGroup, indexById };

  const handlePress = useCallback((item: Media) => {
    const { onPressItem: cb, indexById: map } = latest.current;
    cb?.(item, map.get(item.id) ?? -1);
  }, []);

  const handleLongPress = useCallback((item: Media) => {
    const { onLongPressItem: cb, indexById: map } = latest.current;
    cb?.(item, map.get(item.id) ?? -1);
  }, []);

  const handleToggleGroup = useCallback((ids: number[]) => {
    latest.current.onToggleGroup?.(ids);
  }, []);

  const showHeaderCheckbox = selectionMode && !!onToggleGroup;

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      let allSelected = false;
      if (showHeaderCheckbox) {
        const selectable = item.ids.filter(id => !disabledIds.has(id));
        allSelected = selectable.length > 0 && selectable.every(id => selectedIds.has(id));
      }
      return (
        <GridHeader
          title={item.title}
          ids={item.ids}
          allSelected={allSelected}
          showCheckbox={showHeaderCheckbox}
          onToggle={handleToggleGroup}
        />
      );
    }

    let selKey = '';
    let disKey = '';
    for (const m of item.items) {
      selKey += selectedIds.has(m.id) ? '1' : '0';
      disKey += disabledIds.has(m.id) ? '1' : '0';
    }

    return (
      <GridRow
        items={item.items}
        selKey={selKey}
        disKey={disKey}
        height={item.height}
        widths={item.widths}
        selectionMode={selectionMode}
        showFavoriteBadge={showFavoriteBadge}
        renderCellOverlay={renderCellOverlay}
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
    );
  }, [
    selectedIds,
    disabledIds,
    selectionMode,
    showHeaderCheckbox,
    showFavoriteBadge,
    renderCellOverlay,
    handlePress,
    handleLongPress,
    handleToggleGroup,
  ]);

  const getItemLayout = useCallback(
    (_: ArrayLike<ListItem> | null | undefined, index: number) => ({
      length: offsets[index + 1] - offsets[index],
      offset: offsets[index],
      index,
    }),
    [offsets],
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  // ── Keep the visible content anchored when the column count changes ───────
  const topMediaId = useRef<number | null>(null);
  const visibleKeys = useRef<Set<string>>(new Set());
  const pendingAnchor = useRef(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    visibleKeys.current = new Set(viewableItems.map(v => String(v.key)));
    const firstRow = viewableItems.find(v => (v.item as ListItem | undefined)?.type === 'row');
    if (firstRow) {
      topMediaId.current = (firstRow.item as RowItem).items[0].id;
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  useEffect(() => {
    if (!pendingAnchor.current) { return; }
    pendingAnchor.current = false;
    const id = topMediaId.current;
    if (id == null) { return; }
    const rowIndex = rowKeyById.get(id);
    if (rowIndex == null) { return; }
    // Include the day header just above the row when it is the first row of the day.
    const prev = listData[rowIndex - 1];
    const target = prev && prev.type === 'header' ? rowIndex - 1 : rowIndex;
    listRef.current?.scrollToOffset({ offset: offsets[target], animated: false });
  }, [listData, offsets, rowKeyById]);

  const changeColumns = useCallback((delta: number) => {
    const next = clampColumns(columns + delta);
    if (next !== columns) {
      pendingAnchor.current = true;
      setColumns(next);
    }
  }, [columns, setColumns]);

  useImperativeHandle(ref, () => ({
    scrollToMedia: (id: number) => {
      const rowIndex = rowKeyById.get(id);
      if (rowIndex == null) { return; }
      const row = listData[rowIndex];
      if (row && visibleKeys.current.has(row.key)) { return; }
      const currentHeight = offsets[rowIndex + 1] - offsets[rowIndex];
      const offset = Math.max(0, offsets[rowIndex] - height / 2 + currentHeight / 2);
      listRef.current?.scrollToOffset({ offset, animated: false });
    },
  }), [rowKeyById, listData, offsets, height]);

  // ── Pinch to change the column count ──────────────────────────────────────
  const pinchScale = useSharedValue(1);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .enabled(pinchToZoom)
    .onUpdate(e => {
      pinchScale.value = Math.min(1.12, Math.max(0.9, e.scale));
    })
    .onEnd(e => {
      if (e.scale > 1.2) {
        scheduleOnRN(changeColumns, -1);
      } else if (e.scale < 0.83) {
        scheduleOnRN(changeColumns, 1);
      }
    })
    .onFinalize(() => {
      pinchScale.value = withTiming(1, { duration: 150 });
    }), [pinchToZoom, pinchScale, changeColumns]);

  const pinchStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinchScale.value }],
  }));

  if (loading && media.length === 0) {
    return <SkeletonGrid columns={columns} />;
  }

  return (
    <GestureDetector gesture={pinchGesture}>
      <Animated.View style={[styles.flex, pinchStyle]}>
        <FlatList
          ref={listRef}
          data={listData}
          extraData={renderItem}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          initialNumToRender={Math.ceil(height / (width / columns)) + 2}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={30}
          windowSize={7}
          removeClippedSubviews
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#1a73e8']}
                tintColor="#1a73e8"
              />
            ) : undefined
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={1.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerSpinner} color="#1a73e8" /> : undefined
          }
          ListEmptyComponent={ListEmptyComponent}
          ListHeaderComponent={ListHeaderComponent}
          onScroll={onScroll}
          scrollEventThrottle={16}
        />
      </Animated.View>
    </GestureDetector>
  );
};

export default MediaGrid;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  headerText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#3c4043' },
  headerCheckBtn: { padding: 4 },
  headerCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#9aa0a6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCheckActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },

  row: { flexDirection: 'row', paddingBottom: GRID_GAP },
  cell: { overflow: 'hidden', backgroundColor: '#fff' },
  cellGap: { marginLeft: GRID_GAP },
  cellInner: { flex: 1, overflow: 'hidden', backgroundColor: '#f1f3f4' },
  cellInnerSelected: { borderRadius: 10 },

  videoBadge: {
    position: 'absolute',
    top: 4,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
  },
  favoriteBadge: { position: 'absolute', bottom: 5, left: 5 },
  processingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedBadge: { position: 'absolute', bottom: 5, right: 5 },
  disabledOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.45)' },

  selectionOverlay: { ...StyleSheet.absoluteFill, padding: 6 },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  checkBadgeDisabled: { backgroundColor: '#80868b' },
  uncheckedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  footerSpinner: { paddingVertical: 24 },
});
