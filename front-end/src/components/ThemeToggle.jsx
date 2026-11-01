import { useState } from 'react';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { applyTheme, readStoredTheme, storeTheme } from '../lib/theme.js';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readStoredTheme);
  const isDark = theme === 'dark';
  const label = isDark ? 'Passer au thème clair' : 'Passer au thème sombre';

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {isDark
        ? <SunIcon aria-hidden="true" size={19} weight="bold" />
        : <MoonIcon aria-hidden="true" size={19} weight="bold" />}
    </button>
  );
}
