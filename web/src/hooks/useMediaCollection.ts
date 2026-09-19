import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import type { Media } from '../types/media';
import { compareMediaDesc } from '../utils/dateUtils';
import { showToast } from '../utils/toast';

export interface PageResult {
  results: Media[];
  hasMore: boolean;
  count: number;
}

export type PageFetcher = (page: number) => Promise<PageResult>;

export interface MediaCollection {
  items: Media[];
  count: number | null;
  loading: boolean;
  initialLoading: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Insert (sorted) or replace an item, e.g. when an upload finishes. */
  upsert: (media: Media) => void;
  toggleFavorite: (id: number) => void;
  setFavorite: (ids: number[], value: boolean) => Promise<boolean>;
  /** Optimistically remove items, run the request, and put them back if it fails. */
  removeOptimistic: (ids: number[], request: () => Promise<unknown>, errorMessage: string) => Promise<boolean>;
  trash: (ids: number[]) => Promise<boolean>;
  mutate: (items: Media[]) => void;
}

const PROCESSING_POLL_MIN_MS = 5000;
const PROCESSING_POLL_MAX_MS = 60000;
const MAX_POLLED = 200; // server cap for /media/status/

function insertSorted(list: Media[], additions: Media[]): Media[] {
  if (additions.length === 0) return list;
  const ids = new Set(additions.map((m) => m.id));
  return [...list.filter((m) => !ids.has(m.id)), ...additions].sort(compareMediaDesc);
}

/**
 * Paginated media list with optimistic mutations. The fetcher is captured once:
 * remount the owning component (via `key`) when the filters change.
 */
export function useMediaCollection(fetchPage: PageFetcher): MediaCollection {
  const [items, setItems] = useState<Media[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRef = useRef(fetchPage);
  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const hasMoreRef = useRef(true);
  const itemsRef = useRef<Media[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMoreRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = pageRef.current + 1;
      const res = await fetchRef.current(page);
      pageRef.current = page;
      hasMoreRef.current = res.hasMore;
      setItems((prev) => {
        // Pages can overlap when new items were added since the first page; dedupe by id.
        const seen = new Set(prev.map((m) => m.id));
        const fresh = res.results.filter((m) => !seen.has(m.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      setCount(res.count);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load photos'));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  // Keep items that are still processing up to date: one batched request per tick, backing off
  // while nothing changes (items stuck on the server would otherwise be polled forever).
  const processingKey = useMemo(
    () =>
      items
        .filter((m) => m.status === 'processing')
        .slice(0, MAX_POLLED)
        .map((m) => m.id)
        .join(','),
    [items],
  );
  useEffect(() => {
    if (!processingKey) return;
    const ids = processingKey.split(',').map(Number);
    let delay = PROCESSING_POLL_MIN_MS;
    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) {
        document.addEventListener('visibilitychange', schedule, { once: true });
        return;
      }
      let results: Media[] | null = null;
      try {
        results = await api.mediaStatus(ids);
      } catch {
        // Transient; try again after the backoff.
      }
      if (cancelled) return;
      if (results) {
        const byId = new Map(results.map((m) => [m.id, m]));
        const gone = new Set(ids.filter((id) => !byId.has(id) || byId.get(id)!.status === 'duplicate'));
        const changed = results.filter((m) => m.status !== 'processing' && !gone.has(m.id));
        if (gone.size > 0 || changed.length > 0) {
          const updates = new Map(changed.map((m) => [m.id, m]));
          // Changing items changes processingKey, which restarts this effect at the fast cadence.
          setItems((prev) => prev.filter((m) => !gone.has(m.id)).map((m) => updates.get(m.id) ?? m));
          return;
        }
      }
      delay = Math.min(delay * 2, PROCESSING_POLL_MAX_MS);
      schedule();
    };

    function schedule() {
      if (!cancelled) timer = window.setTimeout(tick, delay);
    }

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [processingKey]);

  const upsert = useCallback((media: Media) => {
    const list = itemsRef.current;
    const exists = list.some((m) => m.id === media.id);
    if (!exists) setCount((c) => (c === null ? c : c + 1));
    // Older than everything loaded so far while more pages exist: it will arrive with a later page.
    const last = list[list.length - 1];
    if (!exists && hasMoreRef.current && last && compareMediaDesc(media, last) > 0) return;
    setItems((prev) => insertSorted(prev, [media]));
  }, []);

  const patchFavorite = useCallback((values: Map<number, boolean>) => {
    setItems((prev) => prev.map((m) => (values.has(m.id) && m.is_favorite !== values.get(m.id) ? { ...m, is_favorite: values.get(m.id)! } : m)));
  }, []);

  const toggleFavorite = useCallback(
    (id: number) => {
      const current = itemsRef.current.find((m) => m.id === id);
      if (!current) return;
      const next = !current.is_favorite;
      patchFavorite(new Map([[id, next]]));
      api.setFavorite(id, next).catch((err: unknown) => {
        patchFavorite(new Map([[id, current.is_favorite]]));
        showToast(getErrorMessage(err, 'Could not update favorite'), 'error');
      });
    },
    [patchFavorite],
  );

  const setFavorite = useCallback(
    async (ids: number[], value: boolean) => {
      const previous = new Map(itemsRef.current.filter((m) => ids.includes(m.id)).map((m) => [m.id, m.is_favorite]));
      patchFavorite(new Map(ids.map((id) => [id, value])));
      try {
        await api.bulkFavorite(ids, value);
        return true;
      } catch (err) {
        patchFavorite(previous);
        showToast(getErrorMessage(err, 'Could not update favorites'), 'error');
        return false;
      }
    },
    [patchFavorite],
  );

  const removeOptimistic = useCallback(async (ids: number[], request: () => Promise<unknown>, errorMessage: string) => {
    const idSet = new Set(ids);
    const removed = itemsRef.current.filter((m) => idSet.has(m.id));
    setItems((prev) => prev.filter((m) => !idSet.has(m.id)));
    setCount((c) => (c === null ? c : Math.max(0, c - removed.length)));
    try {
      await request();
      return true;
    } catch (err) {
      setItems((prev) => insertSorted(prev, removed));
      setCount((c) => (c === null ? c : c + removed.length));
      showToast(getErrorMessage(err, errorMessage), 'error');
      return false;
    }
  }, []);

  const trash = useCallback(
    (ids: number[]) =>
      removeOptimistic(ids, () => (ids.length === 1 ? api.trash(ids[0]) : api.bulkTrash(ids)), 'Could not move to trash'),
    [removeOptimistic],
  );

  return {
    items,
    count,
    loading,
    initialLoading: !loadedOnce,
    hasMore,
    error,
    loadMore,
    upsert,
    toggleFavorite,
    setFavorite,
    removeOptimistic,
    trash,
    mutate: setItems,
  };
}
