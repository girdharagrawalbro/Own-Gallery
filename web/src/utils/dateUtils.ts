import type { Media } from '../types/media';

/** The date a media item belongs to on the timeline. */
export function mediaDate(item: Pick<Media, 'taken_at' | 'created_at'>): Date {
  const d = new Date(item.taken_at || item.created_at);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

/** Local-time day key, e.g. "2026-09-08". */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local-time month key, e.g. "2026-09" (same format as GET /media/timeline/). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today", "Yesterday", "Mon, Sep 8" (this year) or "Sep 8, 2024" (older). */
export function formatDayHeader(d: Date, now: Date = new Date()): string {
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "September 2026" style label for a "YYYY-MM" key. */
export function formatMonthKey(key: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: style, year: 'numeric' });
}

/** "Mon, Sep 8, 2026 · 4:32 PM" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export interface DayGroup {
  key: string;
  date: Date;
  items: Media[];
}

/** Group items by local day, keeping the order in which days first appear. */
export function groupByDay(items: Media[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const d = mediaDate(item);
    const key = dayKey(d);
    let group = map.get(key);
    if (!group) {
      group = { key, date: d, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
}

/** Newest first by taken_at (fallback created_at), then by id. */
export function compareMediaDesc(a: Media, b: Media): number {
  const diff = mediaDate(b).getTime() - mediaDate(a).getTime();
  return diff !== 0 ? diff : b.id - a.id;
}
