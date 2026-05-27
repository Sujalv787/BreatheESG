import axios from 'axios';

const rawUrl = import.meta.env.VITE_API_BASE_URL || '';
// fromService property: host gives hostname only (e.g. "breathe-esg-backend-abc.onrender.com")
// If it doesn't start with http, prefix with https://
const baseURL = rawUrl
  ? rawUrl.startsWith('http')
    ? rawUrl
    : `https://${rawUrl}`
  : 'http://localhost:8000';

const client = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT Token dynamically
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle 401 Unauthorized responses
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      // Dispatch a storage event so components can detect auth failure
      window.dispatchEvent(new Event('auth-failed'));
    }
    return Promise.reject(error);
  }
);

export default client;
