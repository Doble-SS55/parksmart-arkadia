import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/overpass/400.css';
import '@fontsource/overpass/600.css';
import '@fontsource/overpass/700.css';
import '@fontsource/overpass/800.css';
import '../styles/global.css';
import './landing.css';
import { ThemeProvider } from '../state/theme';
import Landing from './Landing';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Landing />
    </ThemeProvider>
  </StrictMode>,
);
