export interface Media {
  id: number;
  media_type: 'image' | 'video';
  filename: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnail_url: string | null;
  content_url: string;
  is_favorite: boolean;
  status: 'processing' | 'completed' | 'failed';
  upload_error?: string | null;
  taken_at: string;
  created_at: string;
  updated_at: string;
}

export interface PaginatedMedia {
  count: number;
  next: string | null;
  previous: string | null;
  results: Media[];
}