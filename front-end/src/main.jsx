import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles.css';
import App from './App.jsx';
import { applyTheme, readStoredTheme } from './lib/theme.js';

applyTheme(readStoredTheme());

createRoot(document.getElementById('root')).render(<React.StrictMode><HashRouter><App /></HashRouter></React.StrictMode>);
