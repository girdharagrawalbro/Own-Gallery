export interface Face {
  id: number;
  media_id: number;
  person_id: number | null;
  box_top: number;
  box_right: number;
  box_bottom: number;
  box_left: number;
  confidence: number;
}

export interface Person {
  id: number;
  name: string;
  display_name: string;
  is_hidden: boolean;
  face_count: number;
  media_count: number;
  cover_face: Face | null;
  cover_thumbnail_url: string | null;
  cover_face_url?: string | null;
  created_at: string;
}
