import axios from 'axios';

// Get base URL from environment or use local dev default
const baseURL = import.meta.env.VITE_API_URL || 'https://own-gallery-api.ambitioushill-a50180b1.koreacentral.azurecontainerapps.io/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
