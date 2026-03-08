
import axios from 'axios';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const normalizeBaseUrl = (value: string) => {
  const trimmed = trimTrailingSlash(String(value || '').trim());
  if (!trimmed) return '';
// hai //
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch (_) {
    return trimmed;
  }
};

const withApiSuffix = (value: string) => {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return '';
  if (normalized.startsWith('/')) {
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};

const resolveBaseUrl = () => {
  const envBaseUrl = withApiSuffix(import.meta.env.VITE_API_URL || '');

  if (typeof window === 'undefined') {
    return envBaseUrl || '/api';
  }

  const browserHost = window.location.hostname || 'localhost';
  const isBrowserOnLoopback = LOOPBACK_HOSTS.has(browserHost.toLowerCase());

  if (envBaseUrl) {
    try {
      const parsedEnv = new URL(envBaseUrl);
      const isEnvLoopback = LOOPBACK_HOSTS.has(parsedEnv.hostname.toLowerCase());

      if (isEnvLoopback && !isBrowserOnLoopback) {
        return '/api';
      }

      return envBaseUrl;
    } catch (_) {
      return envBaseUrl.startsWith('/') ? envBaseUrl : '/api';
    }
  }

  return '/api';
};

export const API_BASE_URL = resolveBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, 
});

api.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem('dtep_user');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user && user.token) {
          config.headers.Authorization = `Bearer ${user.token}`;
        }
      } catch (e) {
        localStorage.removeItem('dtep_user');
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (response.config.url?.includes('/auth/login')) {
      console.log('✅ Real Authentication Successful');
    }
    return response;
  },
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('dtep_user');
      if (typeof window !== 'undefined' && window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
