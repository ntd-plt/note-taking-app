import api from './api';

export const noteService = {
  getAll: async () => {
    const response = await api.get('/notes');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/notes/${id}`);
    return response.data;
  },

  create: async (title, content) => {
    const response = await api.post('/notes', { title, content });
    return response.data;
  },

  update: async (id, title, content) => {
    const response = await api.put(`/notes/${id}`, { title, content });
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/notes/${id}`);
    return response.data;
  },

  search: async (query) => {
    const response = await api.get(`/notes/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },
};