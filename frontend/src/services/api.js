import axios from 'axios';

// Default API client (30 s timeout for regular calls)
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// No-timeout client for large file uploads (can take minutes)
const uploadClient = axios.create({
  baseURL: '/api',
  timeout: 0,  // no timeout
});

// Global response error handler
api.interceptors.response.use(
  res => res,
  err => {
    return Promise.reject(err);
  }
);

// Library
export const libraryApi = {
  getAll: (params) => api.get('/library', { params }).then(r => r.data),
  getRecent: () => api.get('/library/recent').then(r => r.data),
  getSeries: () => api.get('/library/series').then(r => r.data),
  getById: (id) => api.get(`/library/${id}`).then(r => r.data),
  toggleFavorite: (id) => api.patch(`/library/${id}/favorite`).then(r => r.data),
  deleteComic: (id) => api.delete(`/library/${id}`).then(r => r.data),
  scanSource: (sourceId) => api.post(`/library/scan/${sourceId}`).then(r => r.data),
};

// Reader
export const readerApi = {
  getPages: (comicId) => api.get(`/reader/${comicId}/pages`).then(r => r.data),
  getPageUrl: (comicId, pageNum) => `/api/reader/${comicId}/page/${pageNum}`,
  getCoverUrl: (comicId) => `/api/reader/${comicId}/cover`,
};

// Sources
export const sourcesApi = {
  getAll: () => api.get('/sources').then(r => r.data),
  create: (data) => api.post('/sources', data).then(r => r.data),
  update: (id, data) => api.put(`/sources/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/sources/${id}`).then(r => r.data),
};

// Progress
export const progressApi = {
  get: (comicId) => api.get(`/progress/${comicId}`).then(r => r.data),
  save: (comicId, data) => api.put(`/progress/${comicId}`, data).then(r => r.data),
  getBookmarks: (comicId) => api.get(`/progress/${comicId}/bookmarks`).then(r => r.data),
  addBookmark: (comicId, data) => api.post(`/progress/${comicId}/bookmarks`, data).then(r => r.data),
  deleteBookmark: (comicId, bookmarkId) => api.delete(`/progress/${comicId}/bookmarks/${bookmarkId}`).then(r => r.data),
};

// Google Drive
export const gdriveApi = {
  getConfigStatus: () => api.get('/gdrive/config-status').then(r => r.data),
  getStatus: () => api.get('/gdrive/status').then(r => r.data),
  getAuthUrl: () => api.get('/gdrive/auth').then(r => r.data),
  disconnect: () => api.post('/gdrive/disconnect').then(r => r.data),
  listFolders: (parent) => api.get('/gdrive/folders', { params: { parent } }).then(r => r.data),
  listFiles: (folderId) => api.get('/gdrive/files', { params: { folderId } }).then(r => r.data),
};

// Upload — uses no-timeout client, supports AbortController signal
export const uploadApi = {
  uploadFiles: (files, onProgress, signal) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return uploadClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
      signal,
    }).then(r => r.data);
  },
  getStatus: (comicId) => api.get(`/upload/status/${comicId}`).then(r => r.data),
  deleteUpload: (comicId) => api.delete(`/upload/${comicId}`).then(r => r.data),
};

export default api;
