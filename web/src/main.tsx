import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Studio } from './studio/Studio';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ?studio=1 is the recording studio for the how-to videos (see web/studio). */}
    {new URLSearchParams(window.location.search).has('studio') ? <Studio /> : <App />}
  </StrictMode>,
);
