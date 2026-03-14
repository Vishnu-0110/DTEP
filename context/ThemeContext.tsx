
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AUTH_STATE_EVENT } from './AuthContext';

export type ThemeType = 'midnight' | 'emerald' | 'cyberpunk' | 'sunset' | 'slate';
export type ColorMode = 'light' | 'dark';

const LOGIN_THEME: ThemeType = 'slate';
const LOGIN_MODE: ColorMode = 'light';
const DEFAULT_THEME: ThemeType = 'midnight';
const THEME_KEY = 'dtep_theme';
const MODE_KEY = 'dtep_mode';
const USER_THEME_PREFIX = 'dtep_theme_user';
const USER_MODE_PREFIX = 'dtep_mode_user';

const hasStoredUserSession = () => {
  if (typeof window === 'undefined') return false;

  try {
    const raw = localStorage.getItem('dtep_user');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const hasId = String(parsed?.id || '').trim().length > 0;
    const hasToken = String(parsed?.token || '').trim().length > 0;
    return hasId && hasToken;
  } catch (_) {
    return false;
  }
};

const getCurrentHash = () => {
  if (typeof window === 'undefined') return '';
  if (window.location.hash) return window.location.hash;
  return hasStoredUserSession() ? '#/' : '#/login';
};
const isThemeType = (value: string): value is ThemeType =>
  value === 'midnight' || value === 'emerald' || value === 'cyberpunk' || value === 'sunset' || value === 'slate';
const isColorMode = (value: string): value is ColorMode => value === 'light' || value === 'dark';

const getActiveUserPreferenceKey = () => {
  if (typeof window === 'undefined') return 'guest';
  try {
    const raw = localStorage.getItem('dtep_user');
    if (!raw) return 'guest';
    const parsed = JSON.parse(raw);
    const value = String(parsed?.id || parsed?.email || '').trim();
    return value || 'guest';
  } catch (_) {
    return 'guest';
  }
};

const getThemeStorageKey = (userKey: string) => `${USER_THEME_PREFIX}:${userKey}`;
const getModeStorageKey = (userKey: string) => `${USER_MODE_PREFIX}:${userKey}`;

const readStoredTheme = () => {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const userKey = getActiveUserPreferenceKey();
  const storedForUser = String(localStorage.getItem(getThemeStorageKey(userKey)) || '').trim();
  if (isThemeType(storedForUser)) return storedForUser;

  const legacy = String(localStorage.getItem(THEME_KEY) || '').trim();
  return isThemeType(legacy) ? legacy : DEFAULT_THEME;
};

const readStoredMode = () => {
  if (typeof window === 'undefined') return 'dark' as ColorMode;

  const userKey = getActiveUserPreferenceKey();
  const storedForUser = String(localStorage.getItem(getModeStorageKey(userKey)) || '').trim();
  if (isColorMode(storedForUser)) return storedForUser;

  const legacy = String(localStorage.getItem(MODE_KEY) || '').trim();
  if (isColorMode(legacy)) return legacy;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const persistThemeForActiveUser = (newTheme: ThemeType) => {
  if (typeof window === 'undefined') return;
  const userKey = getActiveUserPreferenceKey();
  localStorage.setItem(getThemeStorageKey(userKey), newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
};

const persistModeForActiveUser = (newMode: ColorMode) => {
  if (typeof window === 'undefined') return;
  const userKey = getActiveUserPreferenceKey();
  localStorage.setItem(getModeStorageKey(userKey), newMode);
  localStorage.setItem(MODE_KEY, newMode);
};

interface ThemeContextType {
  theme: ThemeType;
  mode: ColorMode;
  setTheme: (theme: ThemeType) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(() => readStoredTheme());
  const [mode, setModeState] = useState<ColorMode>(() => readStoredMode());
  const [routeHash, setRouteHash] = useState(getCurrentHash);

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    persistThemeForActiveUser(newTheme);
  };

  const toggleMode = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setModeState(newMode);
    persistModeForActiveUser(newMode);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncHash = () => setRouteHash(getCurrentHash());
    const syncPreferences = () => {
      setThemeState(readStoredTheme());
      setModeState(readStoredMode());
    };
    window.addEventListener('hashchange', syncHash);
    window.addEventListener(AUTH_STATE_EVENT, syncPreferences);
    syncHash();

    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener(AUTH_STATE_EVENT, syncPreferences);
    };
  }, []);

  useEffect(() => {
    const isLoginRoute = routeHash.startsWith('#/login');
    const appliedTheme = isLoginRoute ? LOGIN_THEME : theme;
    const appliedMode = isLoginRoute ? LOGIN_MODE : mode;

    document.documentElement.setAttribute('data-theme', appliedTheme);
    document.documentElement.setAttribute('data-mode', appliedMode);
    // Force a minor repaint/class update for tailwind if needed, 
    // though data-mode in CSS variables is more elegant.
    if (appliedMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [mode, routeHash, theme]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
