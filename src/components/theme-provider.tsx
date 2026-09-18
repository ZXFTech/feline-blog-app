"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const THEMES = ["light", "dark", "sugar", "warm"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "donmiss-theme";
const THEME_CLASSES = THEMES.filter((t) => t !== "light");
const THEME_TRANSITION_CLASS = "theme-transitioning";
const THEME_TRANSITION_MS = 800;

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  if (theme !== "light") root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    // noli-button restores the visible selector state after the pre-hydration ThemeScript applies it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && THEMES.includes(stored)) setThemeState(stored);
  }, []);

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      document.documentElement.classList.remove(THEME_TRANSITION_CLASS);
    },
    []
  );

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    root.classList.add(THEME_TRANSITION_CLASS);
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    transitionTimerRef.current = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
      transitionTimerRef.current = null;
    }, THEME_TRANSITION_MS);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/** Inline script that applies the stored theme before hydration to avoid a flash. */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var c=['dark','sugar','warm'];document.documentElement.classList.remove.apply(document.documentElement.classList,c);if(t&&t!=='light'&&c.indexOf(t)>-1){document.documentElement.classList.add(t);}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
