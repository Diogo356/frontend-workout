// src/services/authService.js - VERSÃO CORRIGIDA
import { create } from 'zustand';
import api from './api';
import toast from 'react-hot-toast';

// === ZUSTAND STORE (COM FALLBACK) ===
export const useAuthStore = create((set) => ({
  user: null,
  company: null,
  isLoading: false,
  isCheckingAuth: false,

  setAuth: (user, company, tokens = null) => {
    // ✅ SE vier tokens, salva no localStorage como fallback
    if (tokens) {
      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
    }
    set({ user, company });
  },

  clearAuth: () => {
    // ✅ LIMPA localStorage também
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, company: null });
  },

  setCheckingAuth: (checking) => set({ isCheckingAuth: checking }),

  updateCompanySettings: (settings) => set((state) => ({
    company: state.company ? { ...state.company, ...settings } : null
  })),

  updateCompanyPlan: (plan, maxUsers) => set((state) => ({
    company: state.company ? { 
      ...state.company, 
      plan,
      settings: { ...state.company.settings, maxUsers }
    } : null
  }))
}));

// === AUTH SERVICE - VERSÃO COM FALLBACK ===
class AuthService {
  constructor() {
    this._checkAuthPromise = null;
  }

  // === LOGIN COM FALLBACK ===
  async login(credentials) {
    useAuthStore.setState({ isLoading: true });
    try {
      const response = await api.post('/auth/login', credentials);
      if (!response.success) throw new Error(response.message);

      const { user, company, tokens } = response.data;
      
      // ✅ SE vier tokens no response, usa fallback do localStorage
      if (tokens) {
        console.log('🔐 Usando fallback localStorage para tokens');
        useAuthStore.getState().setAuth(user, company, tokens);
      } else {
        // Se não vier tokens, confia nos cookies
        useAuthStore.getState().setAuth(user, company);
      }
      
      toast.success(`Bem-vindo, ${user.name}!`);
      return { success: true, user, company };
    } catch (error) {
      toast.error(error.response?.data?.message || 'Credenciais inválidas');
      throw error;
    } finally {
      useAuthStore.setState({ isLoading: false });
    }
  }

  // === REFRESH TOKEN COM FALLBACK ===
  async refreshToken() {
    try {
      // ✅ TENTA primeiro pelo método normal (cookies)
      const response = await api.post('/auth/refresh-token');
      
      // ✅ SE vier tokens no body, atualiza localStorage
      if (response.data.tokens) {
        localStorage.setItem('access_token', response.data.tokens.accessToken);
        localStorage.setItem('refresh_token', response.data.tokens.refreshToken);
      }
      
      return { success: true };
    } catch (error) {
      // ✅ SE falhar, tenta pelo localStorage
      const storedRefreshToken = localStorage.getItem('refresh_token');
      if (storedRefreshToken) {
        try {
          const response = await api.post('/auth/refresh-token', {
            refreshToken: storedRefreshToken
          });
          
          if (response.data.tokens) {
            localStorage.setItem('access_token', response.data.tokens.accessToken);
            localStorage.setItem('refresh_token', response.data.tokens.refreshToken);
            return { success: true };
          }
        } catch (fallbackError) {
          console.log('❌ Fallback também falhou');
        }
      }
      
      this.clearAuthSilently();
      throw error;
    }
  }

  // === VERIFICA AUTENTICAÇÃO COM FALLBACK ===
  async checkAuth() {
    if (this._checkAuthPromise) {
      return this._checkAuthPromise;
    }

    const store = useAuthStore.getState();
    
    if (store.isCheckingAuth) {
      return false;
    }

    store.setCheckingAuth(true);
    
    this._checkAuthPromise = new Promise(async (resolve) => {
      try {
        // ✅ PRIMEIRO: Tenta com cookies (método normal)
        const response = await api.get('/auth/me');
        
        if (response.success) {
          const { user, company } = response.data;
          store.setAuth(user, company);
          resolve(true);
        } else {
          throw new Error('Resposta não sucedida');
        }
      } catch (error) {
        // ✅ SE falhar (401), tenta refresh token
        if (error.response?.status === 401) {
          try {
            await this.refreshToken();
            const retry = await api.get('/auth/me');
            
            if (retry.success) {
              const { user, company } = retry.data;
              store.setAuth(user, company);
              resolve(true);
            } else {
              throw new Error('Falha no retry');
            }
          } catch (refreshError) {
            // ✅ SE refresh falhar, limpa tudo
            this.clearAuthSilently();
            resolve(false);
          }
        } else {
          this.clearAuthSilently();
          resolve(false);
        }
      } finally {
        store.setCheckingAuth(false);
        this._checkAuthPromise = null;
      }
    });

    return this._checkAuthPromise;
  }

  // === LOGOUT ===
  async logout() {
    try {
      await api.post('/auth/logout').catch(() => {});
    } catch (error) {
      console.error('Erro no logout:', error);
    } finally {
      useAuthStore.getState().clearAuth();
      toast.success('Sessão encerrada');
    }
  }

  // === LIMPEZA SILENCIOSA ===
  clearAuthSilently() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    useAuthStore.setState({ user: null, company: null });
  }

  // === GETTERS ===
  isAuthenticated() {
    return !!useAuthStore.getState().user;
  }

  getCurrentUser() { 
    return useAuthStore.getState().user; 
  }
  
  getCurrentCompany() { 
    return useAuthStore.getState().company; 
  }
  
  get isLoading() { 
    return useAuthStore.getState().isLoading; 
  }
  
  get isCheckingAuth() { 
    return useAuthStore.getState().isCheckingAuth; 
  }

  // ✅ NOVO: Pega token do localStorage para usar em headers
  getStoredAccessToken() {
    return localStorage.getItem('access_token');
  }
}

export default new AuthService();