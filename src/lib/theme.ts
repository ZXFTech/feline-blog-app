export const THEME_STORAGE_KEY = "feline-blog-theme";

export const themes = ["light", "dark", "sugar", "warm"] as const;

export type ThemeName = (typeof themes)[number];

export function isThemeName(value: string | null): value is ThemeName {
  return value !== null && themes.some((theme) => theme === value);
}

export function getSystemTheme(mediaQuery: MediaQueryList): ThemeName {
  return mediaQuery.matches ? "dark" : "light";
}

export function readStoredTheme(storage: Pick<Storage, "getItem">): ThemeName | null {
  try {
    const storedTheme = storage.getItem(THEME_STORAGE_KEY);
    return isThemeName(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: ThemeName, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme;
}

export function persistTheme(theme: ThemeName, storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for this page when storage is unavailable.
  }
}

export const themeInitializationScript = `(() => {
  const themes = ${JSON.stringify(themes)};
  let theme = null;
  try {
    const storedTheme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (themes.includes(storedTheme)) theme = storedTheme;
  } catch {}
  if (!theme) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
})();`;
