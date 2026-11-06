// Préférence d'apparence : sombre par défaut, clair sur choix explicite du visiteur.
// La même clé est lue dans index.html avant le premier rendu pour éviter un flash.

const STORAGE_KEY = 'lhermyne-theme';

export const DEFAULT_THEME = 'dark';

const BROWSER_BAR_COLORS = {
  dark: '#100e0b',
  light: '#f6f2ea',
};

export function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored in BROWSER_BAR_COLORS ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Stockage bloqué (navigation privée) : le choix reste valable pour cette visite.
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_BAR_COLORS[theme]);
}
