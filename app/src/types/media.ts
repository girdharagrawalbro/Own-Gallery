export type MediaStatus = 'processing' | 'completed' | 'failed' | 'duplicate';

export interface Media {
  id: number;
  media_type: 'image' | 'video';
  filename: string;
  mime_type: string;
  /** bytes, original */
  file_size: number;
  /** display width (rotation already applied) */
  width: number | null;
  height: number | null;
  /** seconds (videos) */
  duration: number | null;
  is_favorite: boolean;
  status: MediaStatus;
  upload_error: string | null;
  /** ISO datetime, used for timeline grouping */
  taken_at: string;
  created_at: string;
  updated_at: string;

  // All URLs are signed absolute URLs: no Authorization header needed.
  /** small JPEG (~320px) for grid cells */
  thumbnail_url: string;
  /** images: browser-safe JPEG (<=1600px); videos: poster frame */
  preview_url: string;
  /** images: original bytes; videos: best playback stream (supports Range) */
  content_url: string;
  /** original file with Content-Disposition: attachment */
  download_url: string;
}

export interface PaginatedMedia {
  count: number;
  next: string | null;
  previous: string | null;
  results: Media[];
}
