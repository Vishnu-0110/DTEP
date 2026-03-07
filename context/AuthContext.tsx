
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import api from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, expectedRole: UserRole) => Promise<void>;
  logout: () => void;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isDemoMode = false;

  useEffect(() => {
    const storedUser = localStorage.getItem('dtep_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const token = String(parsed?.token || '');
        const isJwtLike = token.split('.').length === 3;
        if (!token || token.startsWith('mock_') || !isJwtLike) {
          localStorage.removeItem('dtep_user');
          setLoading(false);
          return;
        }
        setUser(parsed);
      } catch (e) {
        localStorage.removeItem('dtep_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string, expectedRole: UserRole) => {
    try {
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
    } catch (error: any) {
      let message = 'Login failed.';
      
      if (!error.response) {
        message = 'Network error: backend is offline or the API URL is misconfigured.';
      } else if (error.response.status === 401) {
        message = error.response?.data?.message || 'Invalid credentials. Run "npm run seed" inside the backend folder to create Atlas users.';
      } else {
        message = error.response.data?.message || 'Invalid credentials.';
      }
      
      throw new Error(message);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('dtep_user');
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
