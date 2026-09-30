/**
 * API client.
 *
 * Every request goes through here so the bearer token, error normalisation and
 * DEMO MODE capability discovery live in exactly one place. No secrets are ever
 * stored in the browser - the backend holds all provider keys.
 */

const API_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'docuflow.token';
const USER_KEY = 'docuflow.user';

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const userStore = {
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clear: () => localStorage.removeItem(USER_KEY),
};

async function request(path, { method = 'GET', body, auth = true, raw = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  const token = tokenStore.get();
  if (auth && token) headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Please check your connection and try again.', {
      status: 0,
      code: 'network_error',
    });
  }

  if (raw) {
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError('The export could not be generated. Please try again.', {
        status: response.status,
        code: 'export_error',
      });
    }
    return response;
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      (response.status === 401
        ? 'Your session has expired. Please sign in again.'
        : 'Something went wrong. Please try again.');
    throw new ApiError(message, { status: response.status, code: payload?.error?.code });
  }

  return payload;
}

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

/** Uploads a file as multipart form data. */
async function upload(path, formData, { signal, onProgress } = {}) {
  const token = tokenStore.get();
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;

  // Use XHR when progress reporting is requested (fetch cannot stream uploads).
  if (onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}${path}`);
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        let payload = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(payload);
        } else {
          reject(
            new ApiError(payload?.error?.message || 'Upload failed. Please try again.', {
              status: xhr.status,
              code: payload?.error?.code,
            }),
          );
        }
      };
      xhr.onerror = () =>
        reject(new ApiError('Upload failed. Please check your connection.', { status: 0, code: 'network_error' }));
      xhr.send(formData);
    });
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Please check your connection and try again.', {
      status: 0,
      code: 'network_error',
    });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    throw new ApiError(payload?.error?.message || 'Upload failed. Please try again.', {
      status: response.status,
      code: payload?.error?.code,
    });
  }
  return payload;
}

export const api = {
  // ---- auth ----
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // ---- capabilities ----
  capabilities: () => request('/capabilities', { auth: false }),

  // ---- documents ----
  listDocuments: (params) => request(`/documents${buildQuery(params)}`),
  getDocument: (id) => request(`/documents/${id}`),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  uploadDocument: (file, { onProgress, signal } = {}) => {
    const form = new FormData();
    form.append('file', file);
    return upload('/documents/upload', form, { onProgress, signal });
  },
  processDocument: (id) => request(`/documents/${id}/process`, { method: 'POST' }),
  documentStatus: (id) => request(`/documents/${id}/status`),
  extractedData: (id) => request(`/documents/${id}/extracted-data`),
  validation: (id) => request(`/documents/${id}/validation`),
  processingLogs: (id) => request(`/documents/${id}/logs`),
  stats: () => request('/documents/stats'),
  search: (q) => request(`/documents/search${buildQuery({ q })}`),
  compare: (documentIdA, documentIdB) =>
    request('/documents/compare', { method: 'POST', body: { documentIdA, documentIdB } }),

  // ---- review ----
  reviewQueue: () => request('/review/queue'),
  submitReview: (id, payload) => request(`/documents/${id}/review`, { method: 'POST', body: payload }),
  reviewHistory: (id) => request(`/documents/${id}/review`),

  // ---- chat ----
  chat: (id, question) => request(`/documents/${id}/chat`, { method: 'POST', body: { question } }),
  chatHistory: (id) => request(`/documents/${id}/chat`),

  // ---- exports ----
  exportUrl: (id, format) => `${API_URL}/documents/${id}/export/${format}`,
  downloadExport: async (id, format) => {
    const token = tokenStore.get();
    const response = await fetch(api.exportUrl(id, format), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new ApiError('The export could not be generated. Please try again.', {
        status: response.status,
        code: 'export_error',
      });
    }
    return response;
  },

  // ---- file preview ----
  fileUrl: (id, storagePath) => `${API_URL}/documents/file/${encodeURIComponent(storagePath)}`,
};

export default api;
