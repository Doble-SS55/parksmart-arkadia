import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHART_COLORS, CHART_COLORS_DARK, ChartPaletteContext } from '../components/charts/charts';

export type ThemePreference = 'sistema' | 'claro' | 'oscuro';
export type ResolvedTheme = 'light' | 'dark';

/** Debe coincidir con el script de index.html que aplica el tema antes de pintar. */
export const THEME_KEY = 'psa.theme';
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#10284A', dark: '#08111D' };

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'claro' || v === 'oscuro' ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(p: ThemePreference): void;
  toggle(): void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'sistema' ? system : preference === 'oscuro' ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  }, [resolved]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try {
      if (p === 'sistema') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {
      /* sin almacenamiento: la preferencia dura solo esta sesión */
    }
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ preference, resolved, setPreference, toggle: () => setPreference(resolved === 'dark' ? 'claro' : 'oscuro') }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ChartPaletteContext.Provider value={resolved === 'dark' ? CHART_COLORS_DARK : CHART_COLORS}>{children}</ChartPaletteContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme fuera de ThemeProvider');
  return ctx;
}
