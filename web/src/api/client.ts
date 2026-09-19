import axios, { AxiosError } from 'axios';
import type { AxiosProgressEvent, InternalAxiosRequestConfig } from 'axios';
import type {
  Album,
  AuthTokens,
  Media,
  MediaFilters,
  Paginated,
  TimelineMonth,
  UploadSession,
  User,
} from '../types/media';

export const API_BASE: string =
  import.meta.env.VITE_API_URL || 'https://own-gallery-api.ambitioushill-a50180b1.koreacentral.azurecontainerapps.io/api';

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

export const ACCESS_TOKEN_KEY = 'auth_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

export const tokenStorage = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  set(tokens: Partial<AuthTokens>) {
    if (tokens.access) localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
    if (tokens.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

let authFailureHandler: (() => void) | null = null;

/** AuthProvider registers this so a failed refresh logs the user out through React state. */
export function setAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

function handleAuthFailure() {
  tokenStorage.clear();
  if (authFailureHandler) {
    // Clearing the user makes ProtectedRoute redirect to /login.
    authFailureHandler();
    return;
  }
  const path = window.location.pathname;
  if (path !== '/login' && path !== '/register') {
    window.location.assign('/login');
  }
}

/* ------------------------------------------------------------------ */
/* Axios instance + refresh-on-401 interceptor                         */
/* ------------------------------------------------------------------ */

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

const AUTH_ENDPOINTS = ['/auth/login/', '/auth/register/', '/auth/token/refresh/'];

let refreshInFlight: Promise<string> | null = null;

/**
 * Single in-flight refresh. Every request that hits a 401 while a refresh is running
 * awaits the same promise (the "queue") and is then retried with the new token.
 */
function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    const refresh = tokenStorage.getRefresh();
    refreshInFlight = (async () => {
      if (!refresh) throw new Error('No refresh token');
      // Bare axios, so the refresh call never re-enters our interceptors.
      const res = await axios.post<{ access: string }>(`${API_BASE}/auth/token/refresh/`, { refresh });
      tokenStorage.set({ access: res.data.access });
      return res.data.access;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError) || !error.config || error.response?.status !== 401) {
      throw error;
    }
    const config = error.config as RetriableConfig;
    const url = config.url ?? '';
    if (AUTH_ENDPOINTS.some((p) => url.includes(p))) throw error;

    if (config._authRetried) {
      // Still 401 with a freshly refreshed token: the session is unusable.
      handleAuthFailure();
      throw error;
    }

    let access: string;
    try {
      access = await refreshAccessToken();
    } catch (refreshError) {
      // Being offline while refreshing should not log the user out.
      const networkFailure = refreshError instanceof AxiosError && !refreshError.response;
      if (!networkFailure) handleAuthFailure();
      throw error;
    }

    config._authRetried = true;
    config.headers.set('Authorization', `Bearer ${access}`);
    return apiClient(config);
  },
);

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') return data.error;
      if (typeof data.detail === 'string') return data.detail;
    }
    if (!err.response) return 'Network error';
    return `${fallback} (${err.response.status})`;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Typed endpoints                                                     */
/* ------------------------------------------------------------------ */

export const MEDIA_PAGE_SIZE = 100;

export const api = {
  // Auth
  login: (username: string, password: string) =>
    apiClient.post<AuthTokens>('/auth/login/', { username, password }).then((r) => r.data),
  register: (body: { username: string; email: string; password: string; invite_code: string }) =>
    apiClient.post('/auth/register/', body),
  /** Pass `accessToken` to use a token that isn't stored yet (right after login). */
  me: (accessToken?: string) =>
    apiClient
      .get<User>('/auth/me/', accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined)
      .then((r) => r.data),
  updateMe: (body: Pick<User, 'first_name' | 'last_name'>) =>
    apiClient.put<User>('/auth/me/', body).then((r) => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword }),

  // Media reads
  listMedia: (filters: MediaFilters, page: number, pageSize = MEDIA_PAGE_SIZE) =>
    apiClient
      .get<Paginated<Media>>('/media/', { params: { ...filters, page, page_size: pageSize } })
      .then((r) => r.data),
  timeline: (filters: MediaFilters) =>
    apiClient.get<{ months: TimelineMonth[] }>('/media/timeline/', { params: filters }).then((r) => r.data.months),
  getMedia: (id: number, signal?: AbortSignal) =>
    apiClient.get<Media>(`/media/${id}/`, { signal }).then((r) => r.data),
  /** Current state of several uploads in one request (used while they process). */
  mediaStatus: (ids: number[]) =>
    apiClient
      .get<{ results: Media[] }>('/media/status/', { params: { ids: ids.join(',') } })
      .then((r) => r.data.results),
  listTrash: () => apiClient.get<Media[]>('/media/trash/').then((r) => r.data),

  // Media mutations
  setFavorite: (id: number, isFavorite: boolean) =>
    apiClient.post<Media>(`/media/${id}/favorite/`, { is_favorite: isFavorite }).then((r) => r.data),
  updateTakenAt: (id: number, takenAt: Date) =>
    apiClient.post<Media>(`/media/${id}/update-taken-at/`, { taken_at: takenAt.toISOString() }).then((r) => r.data),
  bulkFavorite: (ids: number[], isFavorite: boolean) =>
    apiClient.post('/media/bulk-favorite/', { media_ids: ids, is_favorite: isFavorite }),
  bulkUpdateTakenAt: (ids: number[], takenAt: Date) =>
    apiClient.post('/media/bulk-update-taken-at/', { media_ids: ids, taken_at: takenAt.toISOString() }),
  trash: (id: number) => apiClient.post(`/media/${id}/trash/`),
  bulkTrash: (ids: number[]) => apiClient.post('/media/bulk-trash/', { media_ids: ids }),
  restore: (id: number) => apiClient.post(`/media/${id}/restore/`),
  permanentDelete: (id: number) => apiClient.delete(`/media/${id}/permanent-delete/`),
  emptyTrash: () => apiClient.delete('/media/empty-trash/'),
  share: (id: number) => apiClient.post<{ url: string }>(`/media/${id}/share/`).then((r) => r.data.url),

  // Albums
  listAlbums: () =>
    apiClient
      .get<Album[] | Paginated<Album>>('/albums/')
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.results)),
  getAlbum: (id: number | string) => apiClient.get<Album>(`/albums/${id}/`).then((r) => r.data),
  createAlbum: (name: string) => apiClient.post<Album>('/albums/', { name }).then((r) => r.data),
  deleteAlbum: (id: number | string) => apiClient.delete(`/albums/${id}/`),
  addToAlbum: (albumId: number | string, ids: number[]) =>
    apiClient.post(`/albums/${albumId}/add-media/`, { media_ids: ids }),
  removeFromAlbum: (albumId: number | string, ids: number[]) =>
    apiClient.post(`/albums/${albumId}/remove-media/`, { media_ids: ids }),
  setAlbumCover: (albumId: number | string, mediaId: number) =>
    apiClient.post<Album>(`/albums/${albumId}/set-cover/`, { media_id: mediaId }).then((r) => r.data),

  // Resumable chunked upload ("Upload B")
  createUpload: (
    body: { filename: string; file_size: number; mime_type: string; client_timestamp?: string },
    signal?: AbortSignal,
  ) => apiClient.post<UploadSession>('/media/uploads/', body, { signal }).then((r) => r.data),
  uploadChunk: (
    uploadId: string,
    index: number,
    chunk: Blob,
    opts: { signal: AbortSignal; onProgress: (loaded: number) => void },
  ) =>
    apiClient.put(`/media/uploads/${uploadId}/chunks/${index}/`, chunk, {
      headers: { 'Content-Type': 'application/octet-stream' },
      signal: opts.signal,
      onUploadProgress: (e: AxiosProgressEvent) => opts.onProgress(e.loaded),
    }),
  completeUpload: (uploadId: string, signal?: AbortSignal) =>
    apiClient.post<Media>(`/media/uploads/${uploadId}/complete/`, null, { signal }).then((r) => r.data),
  cancelUpload: (uploadId: string) => apiClient.delete(`/media/uploads/${uploadId}/`),
};
