import { api } from './client';
import { Album, PaginatedAlbums } from '../types/album';
import { Media } from '../types/media';

export const getAlbums = async (page: number = 1, search?: string): Promise<PaginatedAlbums> => {
    let url = `/albums/?page=${page}`;
    if (search) {
        url += `&search=${encodeURIComponent(search)}`;
    }
    const response = await api.get<PaginatedAlbums>(url);
    return response.data;
};

export const getAlbum = async (id: number): Promise<Album> => {
    const response = await api.get<Album>(`/albums/${id}/`);
    return response.data;
};

export const createAlbum = async (name: string, description: string = ''): Promise<Album> => {
    const response = await api.post<Album>('/albums/', { name, description });
    return response.data;
};

export const updateAlbum = async (id: number, data: Partial<{name: string, description: string}>): Promise<Album> => {
    const response = await api.patch<Album>(`/albums/${id}/`, data);
    return response.data;
};

export const deleteAlbum = async (id: number): Promise<void> => {
    await api.delete(`/albums/${id}/`);
};

export const getAlbumMedia = async (id: number): Promise<{album: Album, media: Media[]}> => {
    const response = await api.get<{album: Album, media: Media[]}>(`/albums/${id}/media/`);
    return response.data;
};

export const addMediaToAlbum = async (id: number, media_ids: number[]): Promise<any> => {
    const response = await api.post(`/albums/${id}/add-media/`, { media_ids });
    return response.data;
};

export const removeMediaFromAlbum = async (id: number, media_ids: number[]): Promise<any> => {
    const response = await api.post(`/albums/${id}/remove-media/`, { media_ids });
    return response.data;
};

export const setAlbumCover = async (albumId: number, mediaId: number): Promise<Album> => {
    const response = await api.post<Album>(`/albums/${albumId}/set-cover/`, { media_id: mediaId });
    return response.data;
};
