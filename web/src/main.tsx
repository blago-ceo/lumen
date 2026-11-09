import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { StoreProvider } from './lib/store';
import { detectLiquid, initTelegram } from './lib/tg';
import './styles/global.css';

initTelegram();
detectLiquid();

createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user">
    <StoreProvider>
      <App />
    </StoreProvider>
  </MotionConfig>,
);

// PWA: офлайн-оболочка и установка на телефон
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
