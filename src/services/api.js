// src/services/api.js - VERSÃO COM FALLBACK
import axios from 'axios';
import AuthService from './authService';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true, // ✅ Mantém para cookies
});

// === REQUEST INTERCEPTOR COM FALLBACK ===
api.interceptors.request.use(config => {
  // Remove Content-Type para FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  
  // ✅ ADICIONE: Se tiver token no localStorage, usa como fallback
  const storedToken = AuthService.getStoredAccessToken();
  if (storedToken && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${storedToken}`;
    console.log('🔐 Usando token do localStorage como fallback');
  }
  
  return config;
}, error => Promise.reject(error));

// === RESPONSE INTERCEPTOR COM FALLBACK ===
api.interceptors.response.use(
  response => response.data,
  async error => {
    const originalRequest = error.config;

    if (!error.response) return Promise.reject(error);

    // ✅ SE for 401, tenta refresh token
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await AuthService.refreshToken();
        
        // ✅ DEPOIS do refresh, atualiza o header com novo token (se disponível)
        const newToken = AuthService.getStoredAccessToken();
        if (newToken) {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        }
        
        return api(originalRequest);
      } catch (refreshError) {
        AuthService.clearAuthSilently();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    const message = error.response?.data?.message || 'Erro de conexão';
    return Promise.reject(new Error(message));
  }
);

export default api;