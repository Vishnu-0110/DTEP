
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AUTH_STATE_EVENT } from './AuthContext';

export type ThemeType = 'midnight' | 'emerald' | 'cyberpunk' | 'sunset' | 'slate';
export type ColorMode = 'light' | 'dark';

const DEFAULT_THEME: ThemeType = 'midnight';
const DEFAULT_MODE: ColorMode = 'dark';
const LEGACY_THEME_KEY = 'dtep_theme';
const LEGACY_MODE_KEY = 'dtep_mode';
const USER_THEME_PREFIX = 'dtep_theme_user';
const USER_MODE_PREFIX = 'dtep_mode_user';

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
  const storageKey = getThemeStorageKey(userKey);
  const storedForUser = String(localStorage.getItem(storageKey) || '').trim();
  if (isThemeType(storedForUser)) return storedForUser;

  const legacy = String(localStorage.getItem(LEGACY_THEME_KEY) || '').trim();
  if (isThemeType(legacy)) {
    localStorage.setItem(storageKey, legacy);
    return legacy;
  }

  return DEFAULT_THEME;
};

const readStoredMode = () => {
  if (typeof window === 'undefined') return DEFAULT_MODE;

  const userKey = getActiveUserPreferenceKey();
  const storageKey = getModeStorageKey(userKey);
  const storedForUser = String(localStorage.getItem(storageKey) || '').trim();
  if (isColorMode(storedForUser)) return storedForUser;

  const legacy = String(localStorage.getItem(LEGACY_MODE_KEY) || '').trim();
  if (isColorMode(legacy)) {
    localStorage.setItem(storageKey, legacy);
    return legacy;
  }

  return DEFAULT_MODE;
};

const persistThemeForActiveUser = (newTheme: ThemeType) => {
  if (typeof window === 'undefined') return;
  const userKey = getActiveUserPreferenceKey();
  localStorage.setItem(getThemeStorageKey(userKey), newTheme);
};

const persistModeForActiveUser = (newMode: ColorMode) => {
  if (typeof window === 'undefined') return;
  const userKey = getActiveUserPreferenceKey();
  localStorage.setItem(getModeStorageKey(userKey), newMode);
};

interface ThemeContextType {
  theme: ThemeType;
  mode: ColorMode;
  setTheme: (theme: ThemeType) => void;
  setMode: (mode: ColorMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(() => readStoredTheme());
  const [mode, setModeState] = useState<ColorMode>(() => readStoredMode());

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    persistThemeForActiveUser(newTheme);
  };
  const setMode = (newMode: ColorMode) => {
    setModeState(newMode);
    persistModeForActiveUser(newMode);
  };

  const toggleMode = () => {
    setMode(mode === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncPreferences = () => {
      setThemeState(readStoredTheme());
      setModeState(readStoredMode());
    };
    const syncFromStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key.startsWith(USER_THEME_PREFIX) ||
        event.key.startsWith(USER_MODE_PREFIX) ||
        event.key === LEGACY_THEME_KEY ||
        event.key === LEGACY_MODE_KEY ||
        event.key === 'dtep_user'
      ) {
        syncPreferences();
      }
    };

    window.addEventListener(AUTH_STATE_EVENT, syncPreferences);
    window.addEventListener('storage', syncFromStorage);
    syncPreferences();

    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, syncPreferences);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', mode);
    // Force a minor repaint/class update for tailwind if needed, 
    // though data-mode in CSS variables is more elegant.
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [mode, theme]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
