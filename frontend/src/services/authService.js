import api from './api';
import { setTokens, clearTokens } from '../utils/tokenManager';

export const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token, token } = response.data;
    setTokens(access_token, token);
    return response.data;
  },

  signup: async (name, email, password) => {
    const response = await api.post('/auth/signup', { name, email, password });
    const { access_token, token } = response.data;
    setTokens(access_token, token);
    return response.data;
  },

  logout: () => {
    clearTokens();
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};