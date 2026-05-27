import axios from 'axios';

// Production backend URL — hardcoded to avoid env var build-time issues
const PROD_BACKEND = 'https://breathe-esg-backend-5hej.onrender.com';
const baseURL = import.meta.env.DEV ? 'http://localhost:8000' : PROD_BACKEND;

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
