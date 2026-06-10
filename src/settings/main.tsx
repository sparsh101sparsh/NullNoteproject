import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SettingsApp from './App';
import '../styles/tailwind.css';

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>
);
