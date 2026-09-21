const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const mediaDate = (m: { taken_at?: string | null; created_at?: string | null }): Date => {
  const d = new Date(m.taken_at || m.created_at || 0);
  return isNaN(d.getTime()) ? new Date(0) : d;
};

/** Local calendar-day key, e.g. "2026-9-8". */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Google Photos style day title: "Today", "Yesterday", "Mon, Sep 8" or "Sep 8, 2024". */
export const formatDayTitle = (d: Date, now: Date = new Date()): string => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) { return 'Today'; }
  if (diffDays === 1) { return 'Yesterday'; }
  if (d.getFullYear() === now.getFullYear()) {
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const formatDateRange = (start: Date, end: Date): string => {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  const startY = start.getFullYear();
  const startM = start.getMonth();
  const startD = start.getDate();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  const endD = end.getDate();

  if (startY !== endY) {
    return `${MONTHS[startM]} ${startD}, ${startY} - ${MONTHS[endM]} ${endD}, ${endY}`;
  }
  if (startM !== endM) {
    return `${MONTHS[startM]} ${startD} - ${MONTHS[endM]} ${endD}, ${startY}`;
  }
  if (startD !== endD) {
    return `${MONTHS[startM]} ${startD}-${endD}, ${startY}`;
  }
  return `${MONTHS[startM]} ${startD}, ${startY}`;
};

export const formatTime = (d: Date): string => {
  let h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${suffix}`;
};

/** "0:07", "12:34", "1:02:03" */
export const formatDuration = (seconds: number | null | undefined): string => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
};

export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) { return '0 Bytes'; }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
