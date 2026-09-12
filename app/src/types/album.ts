export interface Album {
  id: number;
  name: string;
  description: string;
  cover_url: string | null;
  media_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedAlbums {
  count: number;
  next: string | null;
  previous: string | null;
  results: Album[];
}
