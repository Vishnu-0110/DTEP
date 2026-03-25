
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_TIMEOUT_MS = 30000;
const LOGIN_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_MAX = 2;
const DEFAULT_RETRY_DELAY_MS = 1200;
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);
const RETRY_COUNT_KEY = '__dtep_retry_count';
const SKIP_RETRY_KEY = '__dtep_skip_retry';
const AUTH_STORAGE_KEY = 'dtep_user';
const AUTH_STATE_EVENT = 'dtep-auth-state-changed';
const WARMUP_ATTEMPTS = 4;
const WARMUP_DELAY_MS = 1200;
const WARMUP_TIMEOUT_MS = 5000;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const createTimeoutController = (ms: number) => {
  if (typeof AbortController === 'undefined') {
    return {
      signal: undefined,
      cancel: () => {},
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
};

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  [RETRY_COUNT_KEY]?: number;
  [SKIP_RETRY_KEY]?: boolean;
};

const readStoredAuthToken = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = String(parsed?.token || '').trim();
    return token || null;
  } catch (_) {
    return null;
  }
};

let cachedAuthToken: string | null = readStoredAuthToken();

if (typeof window !== 'undefined') {
  const syncCachedAuthToken = () => {
    cachedAuthToken = readStoredAuthToken();
  };

  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === AUTH_STORAGE_KEY) {
      syncCachedAuthToken();
    }
  });
  window.addEventListener(AUTH_STATE_EVENT, syncCachedAuthToken);
}

const readNumberEnv = (key: string) =>
  Number((import.meta.env as Record<string, string | undefined>)[key] || '');

const resolveNumberEnv = (key: string, fallback: number, min: number, max: number) => {
  const raw = readNumberEnv(key);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), min), max);
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = trimTrailingSlash(String(value || '').trim());
  if (!trimmed) return '';

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
const resolveTimeoutMs = () => {
  const raw =
    readNumberEnv('VITE_API_TIMEOUT_MS') ||
    readNumberEnv('VITE_API_TIMEOUT') ||
    DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(raw), 5000), 120000);
};

export const API_TIMEOUT_MS = resolveTimeoutMs();
export const AUTH_LOGIN_TIMEOUT_MS = Math.min(API_TIMEOUT_MS, LOGIN_TIMEOUT_MS);
export const API_RETRY_MAX = resolveNumberEnv('VITE_API_RETRY_MAX', DEFAULT_RETRY_MAX, 0, 5);
export const API_RETRY_DELAY_MS = resolveNumberEnv(
  'VITE_API_RETRY_DELAY_MS',
  DEFAULT_RETRY_DELAY_MS,
  250,
  5000
);

const resolveHealthcheckUrl = () => {
  if (typeof window === 'undefined') return '';

  if (API_BASE_URL.startsWith('/')) {
    const basePath = trimTrailingSlash(API_BASE_URL);
    return `${basePath}/healthz`;
  }

  try {
    const parsed = new URL(API_BASE_URL);
    return `${parsed.protocol}//${parsed.host}${trimTrailingSlash(parsed.pathname)}/healthz`;
  } catch (_) {
    return '';
  }
};

const isNetworkLikeError = (error: AxiosError) => {
  if (error.response) return false;
  const code = String(error.code || '').trim().toUpperCase();
  const message = String(error.message || '').trim().toLowerCase();
  return (
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK' ||
    message.includes('timeout') ||
    message.includes('network')
  );
};

const canRetryRequest = (config?: RetryableRequestConfig) => {
  if (!config) return false;
  if (config[SKIP_RETRY_KEY]) return false;
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '').toLowerCase();
  const isLoginRequest = url.includes('/auth/login');
  return RETRYABLE_METHODS.has(method) || isLoginRequest;
};

let warmupPromise: Promise<void> | null = null;
export const warmupBackendConnection = async () => {
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    const healthUrl = resolveHealthcheckUrl();
    if (!healthUrl || typeof fetch !== 'function') return;

    for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt += 1) {
      const timeout = createTimeoutController(WARMUP_TIMEOUT_MS);

      try {
        const response = await fetch(`${healthUrl}?t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: timeout.signal,
        });

        if (response.ok) return;
      } catch (_) {
        // Keep retrying quietly; login flow has its own visible error path if needed.
      } finally {
        timeout.cancel();
      }

      if (attempt < WARMUP_ATTEMPTS) {
        await wait(WARMUP_DELAY_MS * attempt);
      }
    }
  })().finally(() => {
    warmupPromise = null;
  });

  return warmupPromise;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: API_TIMEOUT_MS,
});

api.interceptors.request.use(
  (config) => {
    if (!cachedAuthToken) {
      cachedAuthToken = readStoredAuthToken();
    }

    if (cachedAuthToken) {
      config.headers.Authorization = `Bearer ${cachedAuthToken}`;
    } else if (config.headers?.Authorization) {
      delete config.headers.Authorization;
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
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const retries = Number(config?.[RETRY_COUNT_KEY] || 0);

    if (
      API_RETRY_MAX > 0 &&
      isNetworkLikeError(error) &&
      canRetryRequest(config) &&
      retries < API_RETRY_MAX
    ) {
      if (config) {
        config[RETRY_COUNT_KEY] = retries + 1;
        await wait(API_RETRY_DELAY_MS * config[RETRY_COUNT_KEY]!);
        return api.request(config);
      }
    }

    if (error?.response?.status === 401) {
      cachedAuthToken = null;
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (typeof window !== 'undefined' && window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { SKIP_RETRY_KEY };
