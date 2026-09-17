import axios from 'axios';

import {
  getAccessToken,
  getRefreshToken,
  saveAccessToken,
  clearTokens,
} from '../storage/authStorage';

export const API_BASE_URL = 'https://own-gallery-api.ambitioushill-a50180b1.koreacentral.azurecontainerapps.io/api';
// export const API_BASE_URL = 'http://192.168.1.71:8000/api'; // LAN IP — works from Android

let onAuthFailure: (() => void) | null = null;

export const setAuthFailureHandler = (
  handler: () => void,
) => {
  onAuthFailure = handler;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: 'application/json',
  },
});

let isRefreshing = false;

let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (
  error: any,
  token: string | null,
) => {
  failedQueue.forEach(promise => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });

  failedQueue = [];
};

api.interceptors.request.use(async config => {
  const token = await getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  response => response,

  async error => {
    const originalRequest = error.config;

    if (
      error.response?.status !== 401 ||
      originalRequest?._retry
    ) {
      return Promise.reject(error);
    }

    if (
      originalRequest.url?.includes('/auth/token/refresh/')
    ) {
      await clearTokens();

      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization =
              `Bearer ${token}`;

            resolve(api(originalRequest));
          },

          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();

      if (!refreshToken) {
        await clearTokens();

        return Promise.reject(error);
      }

      const response = await axios.post(
        `${API_BASE_URL}/auth/token/refresh/`,
        {
          refresh: refreshToken,
        },
      );

      const newAccessToken =
        response.data.access;

      await saveAccessToken(
        newAccessToken,
      );

      processQueue(
        null,
        newAccessToken,
      );

      originalRequest.headers.Authorization =
        `Bearer ${newAccessToken}`;

      return api(originalRequest);

    } catch (refreshError) {

      processQueue(
        refreshError,
        null,
      );

      await clearTokens();

      if (onAuthFailure) {
        onAuthFailure();
      }

      return Promise.reject(refreshError);

    } finally {
      isRefreshing = false;
    }
  },
);