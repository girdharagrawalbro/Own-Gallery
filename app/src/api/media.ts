import {api, API_BASE_URL} from './client';
import {PaginatedMedia, Media} from '../types/media';
import RNFS from 'react-native-fs';
import { getAccessToken } from '../storage/authStorage';
import { Platform } from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

export const getMedia = async (
  page: number = 1,
  isFavorite: boolean = false,
  search?: string,
  mediaType?: 'image' | 'video',
  albumId?: number
): Promise<PaginatedMedia> => {
  let url = `/media/?page=${page}`;
  if (isFavorite) url += '&is_favorite=true';
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (mediaType) url += `&media_type=${mediaType}`;
  if (albumId) url += `&album=${albumId}`;

  const response = await api.get<PaginatedMedia>(url);
  return response.data;
};

export const toggleFavorite = async (id: number, isFavorite: boolean): Promise<Media> => {
  const response = await api.patch<Media>(`/media/${id}/`, {
    is_favorite: isFavorite,
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  return response.data;
};

export const uploadMedia = async (
  uri: string,
  fileName: string,
  fileType: string,
  onUploadProgress: (progressEvent: any) => void,
  timestamp?: string
): Promise<Media> => {
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: fileType,
  } as any);

  if (timestamp && timestamp !== 'undefined' && timestamp !== 'null') {
    formData.append('client_timestamp', timestamp);
  }

  const response = await api.post<Media>('/media/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  });

  return response.data;
};

export const createShareLink = async (id: number): Promise<string> => {
  const response = await api.post<{url: string}>(`/media/${id}/share/`);
  return response.data.url;
};

export const getMediaStatus = async (id: number): Promise<Media> => {
  const response = await api.get<Media>(`/media/${id}/`);
  return response.data;
};

export const getStats = async (): Promise<{total_items: number, total_size: number}> => {
  const response = await api.get('/media/stats/');
  return response.data;
};

export const moveToTrash = async (id: number): Promise<void> => {
  await api.post(`/media/${id}/trash/`);
};

export const restoreFromTrash = async (id: number): Promise<void> => {
  await api.post(`/media/${id}/restore/`);
};

export const getTrashMedia = async (): Promise<Media[]> => {
  const response = await api.get<Media[]>('/media/trash/');
  return response.data;
};

export const permanentDelete = async (id: number): Promise<void> => {
  await api.delete(`/media/${id}/permanent-delete/`);
};

export const emptyTrash = async (): Promise<void> => {
  await api.delete('/media/empty-trash/');
};

export const bulkTrash = async (mediaIds: number[]): Promise<void> => {
  await api.post('/media/bulk-trash/', { media_ids: mediaIds });
};

export const bulkFavorite = async (mediaIds: number[], isFavorite: boolean = true): Promise<void> => {
  await api.post('/media/bulk-favorite/', { media_ids: mediaIds, is_favorite: isFavorite });
};

export const downloadMediaToDevice = async (id: number, filename: string, saveToGallery: boolean = true): Promise<string> => {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const url = `${API_BASE_URL}/media/${id}/download/`;
  const localFile = `${RNFS.CachesDirectoryPath}/${filename}`;

  const options = {
    fromUrl: url,
    toFile: localFile,
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  try {
    const response = await RNFS.downloadFile(options).promise;
    if (response.statusCode === 200) {
      if (saveToGallery && Platform.OS === 'android') {
        const savedUrl = await CameraRoll.saveAsset(localFile, { type: 'auto' });
        await RNFS.unlink(localFile).catch(() => {});
        return savedUrl.node.image.uri;
      }
      return `file://${localFile}`; 
    }
    throw new Error(`Download failed with status ${response.statusCode}`);
  } catch (error) {
    console.error("Download Error:", error);
    throw error;
  }
};
