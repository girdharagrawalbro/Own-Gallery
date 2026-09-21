import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Image as ImageIcon } from 'lucide-react';
import type { Media } from '../types/media';
import { formatDayHeader, groupByDay } from '../utils/dateUtils';
import { aspectRatioOf, computeJustifiedLayout } from '../utils/justifiedLayout';
import TimelineCell from './TimelineCell';
import type { CellModifiers } from './TimelineCell';

const GAP = 4;
const HEADER_HEIGHT = 48;
const SECTION_PADDING_BOTTOM = 20;
const MOBILE_BREAKPOINT = 600;

const targetRowHeight = (width: number) => (width < MOBILE_BREAKPOINT ? 110 : 220);

interface PositionedCell {
  item: Media;
  width: number;
  height: number;
}

interface SectionLayout {
  key: string;
  title: string;
  items: Media[];
  rows: { height: number; cells: PositionedCell[] }[];
  /** Full section height including header and padding (for contain-intrinsic-size). */
  height: number;
}

export interface EmptyState {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

interface TimelineGridProps {
  items: Media[];
  loading: boolean;
  initialLoading: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  selected: ReadonlySet<number>;
  onSelectedChange: (next: Set<number>) => void;
  /** Open the viewer. When omitted (or `clickSelects`), clicking a photo selects it. */
  onOpen?: (id: number) => void;
  clickSelects?: boolean;
  empty: EmptyState;
  /** Date extractor for day-grouping headers. Defaults to photo date (taken_at). */
  dateOf?: (m: Media) => Date;
}

/* ------------------------------------------------------------------ */

interface DaySectionProps {
  section: SectionLayout;
  containerWidth: number;
  selected: ReadonlySet<number>;
  selectionMode: boolean;
  onActivate: (id: number, mods: CellModifiers) => void;
  onToggle: (id: number, mods: CellModifiers) => void;
  onToggleDay: (key: string) => void;
}

const DaySection = memo(({ section, containerWidth, selected, selectionMode, onActivate, onToggle, onToggleDay }: DaySectionProps) => {
  let allSelected = section.items.length > 0;
  for (const item of section.items) {
    if (!selected.has(item.id)) {
      allSelected = false;
      break;
    }
  }

  return (
    <section
      className="tl-section"
      style={{ containIntrinsicSize: `auto ${containerWidth}px auto ${section.height}px` }}
    >
      <header className={`tl-day-header${selectionMode ? ' is-selecting' : ''}${allSelected ? ' is-selected' : ''}`}>
        <button
          type="button"
          className="tl-day-check"
          onClick={() => onToggleDay(section.key)}
          aria-label={allSelected ? `Deselect all from ${section.title}` : `Select all from ${section.title}`}
        >
          <Check size={14} strokeWidth={3} />
        </button>
        <h2>{section.title}</h2>
      </header>
      {section.rows.map((row, r) => (
        <div className="tl-row" key={r} style={{ height: row.height }}>
          {row.cells.map((cell) => (
            <TimelineCell
              key={cell.item.id}
              item={cell.item}
              width={cell.width}
              height={cell.height}
              selected={selected.has(cell.item.id)}
              selectionMode={selectionMode}
              onActivate={onActivate}
              onToggle={onToggle}
            />
          ))}
        </div>
      ))}
    </section>
  );
});

/* ------------------------------------------------------------------ */

const SKELETON_RATIOS = [1.5, 0.75, 1.33, 1, 1.78, 0.8, 1.5, 1.33, 0.67, 1, 1.5, 1.2, 0.75, 1.78, 1, 1.33, 1.5, 0.8];

export const TimelineSkeleton = ({ width }: { width: number }) => {
  const layout = useMemo(
    () => computeJustifiedLayout(SKELETON_RATIOS, { containerWidth: width, targetRowHeight: targetRowHeight(width), gap: GAP }),
    [width],
  );
  return (
    <div className="tl-skeleton" aria-busy="true" aria-label="Loading photos">
      <div className="tl-skeleton-title shimmer" />
      {layout.rows.map((row, r) => (
        <div className="tl-row" key={r} style={{ height: row.height }}>
          {row.boxes.map((box) => (
            <div key={box.index} className="shimmer" style={{ width: box.width, height: box.height }} />
          ))}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const TimelineGrid = ({
  items,
  loading,
  initialLoading,
  hasMore,
  error,
  onLoadMore,
  selected,
  onSelectedChange,
  onOpen,
  clickSelects = false,
  empty,
  dateOf,
}: TimelineGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Measure the container; layout is recomputed only when the integer width changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const groups = useMemo(() => groupByDay(items, dateOf), [items, dateOf]);

  const { sections, order, flat, sectionItems } = useMemo(() => {
    const now = new Date();
    const target = targetRowHeight(width);
    const order = new Map<number, number>();
    const sectionItems = new Map<string, Media[]>();
    const flat: Media[] = [];
    const sections: SectionLayout[] = [];
    if (width > 0) {
      for (const group of groups) {
        const ratios = group.items.map((m) => aspectRatioOf(m.width, m.height));
        const layout = computeJustifiedLayout(ratios, { containerWidth: width, targetRowHeight: target, gap: GAP });
        const locations = group.items.map(m => (m as any).location_name).filter(Boolean);
        let locationStr = '';
        if (locations.length > 0) {
          locationStr = locations[0].split(',')[0];
        }
        
        sections.push({
          key: group.key,
          title: formatDayHeader(group.date, now) + (locationStr ? ` · ${locationStr}` : ''),
          items: group.items,
          rows: layout.rows.map((row) => ({
            height: row.height,
            cells: row.boxes.map((b) => ({ item: group.items[b.index], width: b.width, height: b.height })),
          })),
          height: HEADER_HEIGHT + layout.height + SECTION_PADDING_BOTTOM,
        });
        sectionItems.set(group.key, group.items);
        for (const item of group.items) {
          order.set(item.id, flat.length);
          flat.push(item);
        }
      }
    }
    return { sections, order, sectionItems, flat };
  }, [groups, width]);

  // Latest values for the stable callbacks handed to memoized cells.
  const latest = useRef({ selected, onSelectedChange, onOpen, clickSelects, order, flat, sectionItems });
  useEffect(() => {
    latest.current = { selected, onSelectedChange, onOpen, clickSelects, order, flat, sectionItems };
  });
  const anchorRef = useRef<number | null>(null);

  const toggle = useCallback((id: number, mods: CellModifiers) => {
    const { selected, onSelectedChange, order, flat } = latest.current;
    const next = new Set(selected);
    const anchor = anchorRef.current;
    const a = anchor !== null ? order.get(anchor) : undefined;
    const b = order.get(id);
    if (mods.shiftKey && selected.size > 0 && a !== undefined && b !== undefined) {
      // Shift-click: select the whole range between the last clicked item and this one.
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(flat[i].id);
    } else if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    anchorRef.current = id;
    onSelectedChange(next);
  }, []);

  const activate = useCallback(
    (id: number, mods: CellModifiers) => {
      const { selected, onOpen, clickSelects } = latest.current;
      if (selected.size > 0 || clickSelects || !onOpen) toggle(id, mods);
      else onOpen(id);
    },
    [toggle],
  );

  const toggleDay = useCallback((key: string) => {
    const { selected, onSelectedChange, sectionItems } = latest.current;
    const dayItems = sectionItems.get(key) ?? [];
    const allSelected = dayItems.length > 0 && dayItems.every((m) => selected.has(m.id));
    const next = new Set(selected);
    for (const m of dayItems) {
      if (allSelected) next.delete(m.id);
      else next.add(m.id);
    }
    onSelectedChange(next);
  }, []);

  // Infinite scroll: observe a sentinel relative to the scrolling container. The observer is
  // recreated after each load so it fires again if the sentinel is still visible.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || error) return;
    const root = el.closest('[data-scroll-root]');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root, rootMargin: '0px 0px 1500px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, error, onLoadMore, items.length]);

  const selectionMode = selected.size > 0;
  const showSkeleton = initialLoading && items.length === 0;
  const showEmpty = !initialLoading && !loading && !error && items.length === 0;

  return (
    <div ref={containerRef} className="timeline">
      {showSkeleton && width > 0 && <TimelineSkeleton width={width} />}

      {showEmpty && (
        <div className="empty-state">
          {empty.icon ?? <ImageIcon size={48} />}
          <h2>{empty.title}</h2>
          {empty.description && <p>{empty.description}</p>}
          {empty.action}
        </div>
      )}

      {sections.map((section) => (
        <DaySection
          key={section.key}
          section={section}
          containerWidth={width}
          selected={selected}
          selectionMode={selectionMode}
          onActivate={activate}
          onToggle={toggle}
          onToggleDay={toggleDay}
        />
      ))}

      <div ref={sentinelRef} className="tl-sentinel">
        {error ? (
          <div className="inline-error">
            <span>{error}</span>
            <button className="text-btn" onClick={onLoadMore}>
              Try again
            </button>
          </div>
        ) : (
          loading && !showSkeleton && <div className="spinner" aria-label="Loading more" />
        )}
      </div>
    </div>
  );
};

export default TimelineGrid;
