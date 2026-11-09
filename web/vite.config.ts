import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Порт API берём из ../.env (PORT), а не из окружения — у самого Vite свой PORT */
function apiPort() {
  if (process.env.API_PORT) return process.env.API_PORT;
  try {
    const m = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^PORT=(\d+)/m);
    if (m) return m[1];
  } catch {
    /* нет .env */
  }
  return '8787';
}

export default defineConfig(() => {
  const api = `http://127.0.0.1:${apiPort()}`;
  return {
    // демо на GitHub Pages живёт по адресу /lumen/
    base: process.env.VITE_DEMO === '1' ? '/lumen/' : '/',
    plugins: [react()],
    server: {
      port: Number(process.env.WEB_PORT || 5180),
      host: true,
      allowedHosts: true as const,
      proxy: {
        '/api': api,
        '/uploads': api,
        '/ws': { target: api.replace('http', 'ws'), ws: true },
      },
    },
  };
});
