import { api } from './client';
import { Person, Face } from '../types/people';
import { Media } from '../types/media';

interface PaginatedMedia {
  count: number;
  next: string | null;
  previous: string | null;
  results: Media[];
}

export const getPeople = async (showHidden = false): Promise<Person[]> => {
  const url = showHidden ? '/people/?hidden=true' : '/people/';
  const response = await api.get<Person[]>(url);
  return response.data;
};

export const getPerson = async (id: number): Promise<Person> => {
  const response = await api.get<Person>(`/people/${id}/`);
  return response.data;
};

export const updatePerson = async (
  id: number,
  data: Partial<{ name: string; is_hidden: boolean }>,
): Promise<Person> => {
  const response = await api.patch<Person>(`/people/${id}/`, data);
  return response.data;
};

export const deletePerson = async (id: number): Promise<void> => {
  await api.delete(`/people/${id}/`);
};

export const mergePersons = async (sourceId: number, intoId: number): Promise<Person> => {
  const response = await api.post<Person>(`/people/${sourceId}/merge/`, { into_id: intoId });
  return response.data;
};

export const removeFaceFromPerson = async (personId: number, faceId: number): Promise<void> => {
  await api.post(`/people/${personId}/remove-face/`, { face_id: faceId });
};

export const getPersonMedia = async (id: number, page = 1): Promise<PaginatedMedia> => {
  const response = await api.get<PaginatedMedia>(`/people/${id}/media/?page=${page}&page_size=60`);
  return response.data;
};

export const getMediaFaces = async (mediaId: number): Promise<Face[]> => {
  const response = await api.get<Face[]>(`/media/${mediaId}/faces/`);
  return response.data;
};
