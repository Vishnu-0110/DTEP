
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import api, {
  AUTH_LOGIN_TIMEOUT_MS,
  SKIP_RETRY_KEY,
  warmupBackendConnection
} from '../services/api';

export const AUTH_STATE_EVENT = 'dtep-auth-state-changed';
const COLD_START_LOGIN_MESSAGE =
  'Backend is starting (Render cold start) or too slow to respond. Wait 20-40 seconds and try login again.';
const LOGIN_AUTO_RETRY_MAX = 4;
const LOGIN_AUTO_RETRY_DELAY_MS = 1500;
const LOGIN_WARMUP_WAIT_CAP_MS = 8000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const isColdStartLikeStatus = status === 502 || status === 503 || status === 504;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isDemoMode = false;

  useEffect(() => {
    warmupBackendConnection().catch(() => {
      // Login flow has explicit error handling; ignore proactive warm-up failures.
    });

    const keepWarmTimer = window.setInterval(() => {
      warmupBackendConnection().catch(() => {
        // Keep-alive should be silent; login has its own explicit errors.
      });
    }, 4 * 60 * 1000);

    setLoading(false);

    return () => {
      window.clearInterval(keepWarmTimer);
    };
  }, []);

  const login = useCallback(async (email: string, password: string, expectedRole: UserRole) => {
    await Promise.race([
      warmupBackendConnection(),
      wait(LOGIN_WARMUP_WAIT_CAP_MS),
    ]).catch(() => {
      // If proactive warmup fails, login retries handle transient startup failures.
    });

    let lastErrorMessage = 'Login failed.';

    for (let attempt = 1; attempt <= LOGIN_AUTO_RETRY_MAX; attempt += 1) {
      try {
        const response = await api.post(
          '/auth/login',
          { email, password, expectedRole },
          {
            timeout: AUTH_LOGIN_TIMEOUT_MS,
            [SKIP_RETRY_KEY]: true,
          }
        );
        const { _id, name, role, token } = response.data;
        
        const userData: User & { token: string } = {
          id: _id,
          name,
          email,
          role: role as UserRole,
          token
        };

        setUser(userData);
        localStorage.setItem('dtep_user', JSON.stringify(userData));
        emitAuthStateChanged();
        return;
      } catch (error: any) {
        const classified = classifyLoginError(error);
        lastErrorMessage = classified.message;

        if (classified.retryable && attempt < LOGIN_AUTO_RETRY_MAX) {
          await wait(LOGIN_AUTO_RETRY_DELAY_MS * attempt);
          continue;
        }

        throw new Error(lastErrorMessage);
      }
    }

    throw new Error(lastErrorMessage);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('dtep_user');
    emitAuthStateChanged();
  }, []);

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
