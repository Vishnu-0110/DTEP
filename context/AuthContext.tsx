
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import api, {
  AUTH_LOGIN_TIMEOUT_MS,
  SKIP_RETRY_KEY,
  warmupBackendConnection
} from '../services/api';

export const AUTH_STATE_EVENT = 'dtep-auth-state-changed';
const COLD_START_LOGIN_MESSAGE =
  'Backend is waking up on Render. Keep this page open while login continues automatically.';
const LOGIN_AUTO_RETRY_WINDOW_MS = 180000;
const LOGIN_AUTO_RETRY_DELAY_BASE_MS = 2000;
const LOGIN_AUTO_RETRY_DELAY_MAX_MS = 10000;
const LOGIN_WARMUP_WAIT_CAP_MS = 20000;
const SESSION_VALIDATION_INTERVAL_MS = 30000;
const AUTH_STORAGE_KEY = 'dtep_user';
const LAST_ACTIVITY_STORAGE_KEY = 'dtep_last_activity_at';
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 10000;
const ACTIVITY_PERSIST_MIN_GAP_MS = 15000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'mousemove',
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getLoginRetryDelay = (attempt: number) =>
  Math.min(LOGIN_AUTO_RETRY_DELAY_BASE_MS * attempt, LOGIN_AUTO_RETRY_DELAY_MAX_MS);
const VALID_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.EVALUATOR, UserRole.STUDENT]);

type StoredUser = User & { token: string };
const readStoredLastActivity = (): number | null => {
  if (typeof window === 'undefined') return null;
  const raw = String(localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY) || '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};
const writeStoredLastActivity = (value = Date.now()) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Math.trunc(value)));
};
const clearStoredSession = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
};
const isSessionExpiredByInactivity = (lastActivityAt: number | null) => {
  if (!lastActivityAt) return true;
  return Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS;
};

const readStoredUser = (): StoredUser | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const id = String(parsed?.id || '').trim();
    const name = String(parsed?.name || '').trim();
    const email = String(parsed?.email || '').trim();
    const role = String(parsed?.role || '').trim().toLowerCase() as UserRole;
    const department = String(parsed?.department || '').trim();
    const token = String(parsed?.token || '').trim();
    const profilePhoto = String(parsed?.profilePhoto || '').trim();

    if (!id || !name || !email || !token || !VALID_ROLES.has(role)) {
      clearStoredSession();
      return null;
    }

    const lastActivityAt = readStoredLastActivity();
    if (isSessionExpiredByInactivity(lastActivityAt)) {
      clearStoredSession();
      return null;
    }

    return { id, name, email, role, department, token, profilePhoto };
  } catch (_) {
    clearStoredSession();
    return null;
  }
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, expectedRole: UserRole) => Promise<void>;
  logout: () => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const emitAuthStateChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
};

const classifyLoginError = (error: any) => {
  const status = Number(error?.response?.status || 0);
  const responseMessage = typeof error?.response?.data?.message === 'string'
    ? error.response.data.message
    : '';
  const normalizedResponseMessage = responseMessage.trim().toLowerCase();
  const responseHeaders = error?.response?.headers || {};
  const vercelError = String(responseHeaders['x-vercel-error'] || '').trim().toUpperCase();
  const contentType = String(responseHeaders['content-type'] || '').trim().toLowerCase();

  if (!error.response) {
    const errorCode = String(error?.code || '').trim().toUpperCase();
    const errorMessage = String(error?.message || '').trim().toLowerCase();
    const isTimeout = errorCode === 'ECONNABORTED' || errorMessage.includes('timeout');
    const isNetwork = errorCode === 'ERR_NETWORK' || errorMessage.includes('network');

    if (isTimeout || isNetwork) {
      return { retryable: true, message: COLD_START_LOGIN_MESSAGE };
    }

    return {
      retryable: false,
      message: 'Network error: backend is offline or the API URL is misconfigured.',
    };
  }

  const isColdStartLikeStatus = status === 408 || status === 502 || status === 503 || status === 504;
  const isColdStartLikeMessage =
    normalizedResponseMessage.includes('timeout') ||
    normalizedResponseMessage.includes('timed out') ||
    normalizedResponseMessage.includes('upstream');

  if (isColdStartLikeStatus || isColdStartLikeMessage) {
    return { retryable: true, message: COLD_START_LOGIN_MESSAGE };
  }

  if (
    status === 404 ||
    vercelError === 'NOT_FOUND' ||
    contentType.includes('text/html') ||
    contentType.includes('text/plain')
  ) {
    return {
      retryable: false,
      message: 'Backend API is not connected in production. Configure VITE_API_URL on Vercel or add a /api rewrite to your Render backend.',
    };
  }

  if (status === 401) {
    return {
      retryable: false,
      message: responseMessage || 'Invalid credentials. Run "npm run seed" inside the backend folder to create Atlas users.',
    };
  }

  if (status >= 500) {
    return {
      retryable: false,
      message: responseMessage || 'Backend error. Check the deployed backend logs and environment variables.',
    };
  }

  return {
    retryable: false,
    message: responseMessage || `Login failed with status ${status}.`,
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const loading = false;
  const isDemoMode = false;
  const clearAuthSession = useCallback(() => {
    setUser(null);
    clearStoredSession();
    emitAuthStateChanged();
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const nextStoredUser = readStoredUser();
      if (!nextStoredUser) {
        setUser(null);
        return;
      }
      setUser(nextStoredUser);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== AUTH_STORAGE_KEY && event.key !== LAST_ACTIVITY_STORAGE_KEY) return;
      syncFromStorage();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(AUTH_STATE_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(AUTH_STATE_EVENT, syncFromStorage);
    };
  }, []);

  useEffect(() => {
    warmupBackendConnection().catch(() => {
      // Login flow has explicit error handling; ignore proactive warm-up failures.
    });

    const keepWarmTimer = window.setInterval(() => {
      warmupBackendConnection().catch(() => {
        // Keep-alive should be silent; login has its own explicit errors.
      });
    }, 4 * 60 * 1000);

    return () => {
      window.clearInterval(keepWarmTimer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let isValidating = false;
    const validateActiveSession = async () => {
      if (!isMounted || isValidating) return;
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      isValidating = true;
      try {
        await api.get('/system/maintenance', {
          [SKIP_RETRY_KEY]: true,
        });
      } catch (error: any) {
        if (!isMounted) return;
        if (Number(error?.response?.status || 0) === 401) {
          clearAuthSession();
        }
      } finally {
        isValidating = false;
      }
    };

    // Validate immediately so stale sessions are kicked out without waiting for the interval.
    void validateActiveSession();
    const sessionTimer = window.setInterval(validateActiveSession, SESSION_VALIDATION_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void validateActiveSession();
      }
    };
    const handleFocus = () => {
      void validateActiveSession();
    };
    const handleOnline = () => {
      void validateActiveSession();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(sessionTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, clearAuthSession]);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let lastPersistedAt = Date.now();

    const persistActivity = (force = false) => {
      if (!isMounted) return;
      const now = Date.now();
      if (!force && now - lastPersistedAt < ACTIVITY_PERSIST_MIN_GAP_MS) return;
      lastPersistedAt = now;
      writeStoredLastActivity(now);
    };

    const enforceInactivityTimeout = () => {
      const lastActivityAt = readStoredLastActivity();
      if (!isSessionExpiredByInactivity(lastActivityAt)) return false;
      clearAuthSession();
      if (typeof window !== 'undefined' && window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
      return true;
    };

    // Ensure active sessions start with a fresh activity marker.
    persistActivity(true);
    const inactivityTimer = window.setInterval(() => {
      void enforceInactivityTimeout();
    }, INACTIVITY_CHECK_INTERVAL_MS);

    const handleActivity = () => {
      if (Date.now() - lastPersistedAt >= INACTIVITY_TIMEOUT_MS && enforceInactivityTimeout()) return;
      persistActivity(false);
    };
    const handleVisibilityOrFocus = () => {
      if (enforceInactivityTimeout()) return;
      if (document.visibilityState === 'visible') {
        persistActivity(true);
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity));
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      window.clearInterval(inactivityTimer);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [user, clearAuthSession]);

  const login = useCallback(async (email: string, password: string, expectedRole: UserRole) => {
    await Promise.race([
      warmupBackendConnection(),
      wait(LOGIN_WARMUP_WAIT_CAP_MS),
    ]).catch(() => {
      // If proactive warmup fails, login retries handle transient startup failures.
    });

    let lastErrorMessage = 'Login failed.';
    const startedAt = Date.now();
    let attempt = 1;

    while (Date.now() - startedAt <= LOGIN_AUTO_RETRY_WINDOW_MS) {
      try {
        const response = await api.post(
          '/auth/login',
          { email, password, expectedRole },
          {
            timeout: AUTH_LOGIN_TIMEOUT_MS,
            [SKIP_RETRY_KEY]: true,
          }
        );
        const { _id, name, role, department, token, profilePhoto } = response.data;
        
        const userData: User & { token: string } = {
          id: _id,
          name,
          email,
          role: role as UserRole,
          department: String(department || '').trim(),
          token,
          profilePhoto: String(profilePhoto || '').trim(),
        };

        setUser(userData);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
        writeStoredLastActivity(Date.now());
        emitAuthStateChanged();
        return;
      } catch (error: any) {
        const classified = classifyLoginError(error);
        lastErrorMessage = classified.message;

        if (classified.retryable) {
          const elapsedMs = Date.now() - startedAt;
          const remainingMs = LOGIN_AUTO_RETRY_WINDOW_MS - elapsedMs;
          const retryDelayMs = Math.min(getLoginRetryDelay(attempt), remainingMs);

          if (retryDelayMs <= 0) break;

          await Promise.all([
            wait(retryDelayMs),
            warmupBackendConnection().catch(() => {
              // Retry loop will continue and surface final error if backend never wakes.
            }),
          ]);
          attempt += 1;
          continue;
        }

        throw new Error(lastErrorMessage);
      }
    }

    throw new Error(lastErrorMessage);
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
  }, [clearAuthSession]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isDemoMode }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
