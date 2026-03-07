
import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeType = 'midnight' | 'emerald' | 'cyberpunk' | 'sunset' | 'slate';
export type ColorMode = 'light' | 'dark';

const LOGIN_THEME: ThemeType = 'slate';
const LOGIN_MODE: ColorMode = 'light';

const getCurrentHash = () => (typeof window === 'undefined' ? '' : window.location.hash || '#/');

interface ThemeContextType {
  theme: ThemeType;
  mode: ColorMode;
  setTheme: (theme: ThemeType) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>(() => {
    const saved = localStorage.getItem('dtep_theme');
    return (saved as ThemeType) || 'midnight';
  });

  const [mode, setModeState] = useState<ColorMode>(() => {
    const saved = localStorage.getItem('dtep_mode');
    if (saved) return saved as ColorMode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [routeHash, setRouteHash] = useState(getCurrentHash);

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    localStorage.setItem('dtep_theme', newTheme);
  };

  const toggleMode = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setModeState(newMode);
    localStorage.setItem('dtep_mode', newMode);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncHash = () => setRouteHash(getCurrentHash());
    window.addEventListener('hashchange', syncHash);
    syncHash();

    return () => window.removeEventListener('hashchange', syncHash);
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
