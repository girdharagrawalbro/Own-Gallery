export type MediaType = 'image' | 'video';
export type MediaStatus = 'processing' | 'completed' | 'failed' | 'duplicate';

export interface Media {
  id: number;
  media_type: MediaType;
  filename: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  is_favorite: boolean;
  status: MediaStatus;
  upload_error: string | null;
  taken_at: string;
  created_at: string;
  updated_at: string;
  /** Signed absolute URLs: no auth header or token param needed. */
  thumbnail_url: string;
  preview_url: string;
  content_url: string;
  download_url: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface MediaFilters {
  is_favorite?: boolean;
  media_type?: MediaType;
  search?: string;
  album?: number | string;
}

export interface TimelineMonth {
  /** "YYYY-MM" */
  month: string;
  count: number;
}

export interface Album {
  id: number;
  name: string;
  description?: string;
  cover_url: string | null;
  created_at: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface UploadSession {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
}
