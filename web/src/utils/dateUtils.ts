export interface MediaItem {
  id: number;
  filename: string;
  thumbnail_url: string;
  content_url: string;
  media_type: string;
  is_favorite: boolean;
  file_size: number;
  width: number;
  height: number;
  created_at: string;
  taken_at?: string;
}

export interface MediaGroup {
  dateStr: string;
  items: MediaItem[];
}

export function formatDateStr(dateString: string | undefined): string {
  if (!dateString) return 'Unknown Date';

  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.getDate() === today.getDate() &&
                  date.getMonth() === today.getMonth() &&
                  date.getFullYear() === today.getFullYear();
                  
  const isYesterday = date.getDate() === yesterday.getDate() &&
                      date.getMonth() === yesterday.getMonth() &&
                      date.getFullYear() === yesterday.getFullYear();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

export function groupMediaByDate(items: MediaItem[]): MediaGroup[] {
  const groups: Record<string, MediaItem[]> = {};
  
  items.forEach(item => {
    // prioritize taken_at, fallback to created_at
    const rawDate = item.taken_at || item.created_at;
    const dateStr = formatDateStr(rawDate);
    
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(item);
  });

  const result: MediaGroup[] = [];
  
  // To keep chronological order (assuming API already returns sorted data),
  // we just collect the groups in the order they first appeared.
  const seenDates = new Set<string>();
  items.forEach(item => {
    const rawDate = item.taken_at || item.created_at;
    const dateStr = formatDateStr(rawDate);
    if (!seenDates.has(dateStr)) {
      seenDates.add(dateStr);
      result.push({
        dateStr,
        items: groups[dateStr]
      });
    }
  });

  return result;
}
