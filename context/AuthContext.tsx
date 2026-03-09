
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import api, { warmupBackendConnection } from '../services/api';

export const AUTH_STATE_EVENT = 'dtep-auth-state-changed';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isDemoMode = false;

  useEffect(() => {
    warmupBackendConnection().catch(() => {
      // Login flow has explicit error handling; ignore proactive warm-up failures.
    });

    const storedUser = localStorage.getItem('dtep_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const token = String(parsed?.token || '');
        const isJwtLike = token.split('.').length === 3;
        if (!token || token.startsWith('mock_') || !isJwtLike) {
          localStorage.removeItem('dtep_user');
          emitAuthStateChanged();
          setLoading(false);
          return;
        }
        setUser(parsed);
      } catch (e) {
        localStorage.removeItem('dtep_user');
        emitAuthStateChanged();
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string, expectedRole: UserRole) => {
    try {
      await warmupBackendConnection();
      const response = await api.post('/auth/login', { email, password, expectedRole });
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
    } catch (error: any) {
      let message = 'Login failed.';
      const status = Number(error?.response?.status || 0);
      const responseMessage = typeof error?.response?.data?.message === 'string'
        ? error.response.data.message
        : '';
      const responseHeaders = error?.response?.headers || {};
      const vercelError = String(responseHeaders['x-vercel-error'] || '').trim().toUpperCase();
      const contentType = String(responseHeaders['content-type'] || '').trim().toLowerCase();
      
      if (!error.response) {
        const errorCode = String(error?.code || '').trim().toUpperCase();
        const errorMessage = String(error?.message || '').trim().toLowerCase();
        const isTimeout = errorCode === 'ECONNABORTED' || errorMessage.includes('timeout');
        message = isTimeout
          ? 'Backend is starting (Render cold start) or too slow to respond. Wait 20-40 seconds and try login again.'
          : 'Network error: backend is offline or the API URL is misconfigured.';
      } else if (
        status === 404 ||
        vercelError === 'NOT_FOUND' ||
        contentType.includes('text/html') ||
        contentType.includes('text/plain')
      ) {
        message = 'Backend API is not connected in production. Configure VITE_API_URL on Vercel or add a /api rewrite to your Render backend.';
      } else if (status === 401) {
        message = responseMessage || 'Invalid credentials. Run "npm run seed" inside the backend folder to create Atlas users.';
      } else if (status >= 500) {
        message = responseMessage || 'Backend error. Check the deployed backend logs and environment variables.';
      } else {
        message = responseMessage || `Login failed with status ${status}.`;
      }
      
      throw new Error(message);
    }
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
