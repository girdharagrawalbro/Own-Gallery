import { api } from './client';
import { PaginatedMedia, Media } from '../types/media';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

export const DEFAULT_PAGE_SIZE = 90;

export interface GetMediaParams {
  page?: number;
  pageSize?: number;
  isFavorite?: boolean;
  search?: string;
  mediaType?: 'image' | 'video';
  albumId?: number;
}

export const getMedia = async ({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  isFavorite = false,
  search,
  mediaType,
  albumId,
}: GetMediaParams = {}): Promise<PaginatedMedia> => {
  let url = `/media/?page=${page}&page_size=${pageSize}`;
  if (isFavorite) { url += '&is_favorite=true'; }
  if (search) { url += `&search=${encodeURIComponent(search)}`; }
  if (mediaType) { url += `&media_type=${mediaType}`; }
  if (albumId) { url += `&album=${albumId}`; }

  const response = await api.get<PaginatedMedia>(url);
  return response.data;
};

export const toggleFavorite = async (id: number, isFavorite: boolean): Promise<Media> => {
  const response = await api.patch<Media>(`/media/${id}/`, {
    is_favorite: isFavorite,
  }, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

export interface UploadProgressEvent {
  loaded: number;
  total?: number;
}

export const uploadMedia = async (
  uri: string,
  fileName: string,
  fileType: string,
  onUploadProgress?: (progressEvent: UploadProgressEvent) => void,
  timestamp?: string,
  signal?: AbortSignal,
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
    // Large videos can take minutes: never apply a client-side timeout here.
    timeout: 0,
    signal,
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

const safeFileName = (item: Pick<Media, 'id' | 'filename'>): string => {
  const cleaned = (item.filename || '').replace(/[/\\?%*:|"<>]/g, '_').trim();
  return cleaned || `media_${item.id}`;
};

/**
 * Downloads the original file via the signed `download_url` (no auth header needed).
 * - saveToGallery=true (Android): saves into the device gallery and returns the gallery uri.
 * - otherwise: returns a `file://` uri in the app cache (e.g. for sharing).
 */
export const downloadMediaToDevice = async (
  item: Pick<Media, 'id' | 'filename' | 'download_url'>,
  saveToGallery: boolean = true,
): Promise<string> => {
  if (!item.download_url) {
    throw new Error('Missing download url');
  }

  const localFile = `${RNFS.CachesDirectoryPath}/${item.id}_${safeFileName(item)}`;

  try {
    const response = await RNFS.downloadFile({
      fromUrl: item.download_url,
      toFile: localFile,
    }).promise;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      await RNFS.unlink(localFile).catch(() => {});
      throw new Error(`Download failed with status ${response.statusCode}`);
    }

    if (saveToGallery && Platform.OS === 'android') {
      const saved = await CameraRoll.saveAsset(localFile, { type: 'auto' });
      await RNFS.unlink(localFile).catch(() => {});
      // The returned asset shape is not guaranteed for videos: read it defensively.
      const node: any = saved?.node;
      return node?.image?.uri || node?.video?.uri || node?.id || '';
    }

    return `file://${localFile}`;
  } catch (error) {
    console.error('Download Error:', error);
    throw error;
  }
};
