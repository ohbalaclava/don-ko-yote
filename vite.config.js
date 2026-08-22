import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// The synthesis lab (lab/index.html) is served by `vite dev` at /lab/ without
// any config, but it is kept OUT of the production bundle: it is an experiment,
// not part of the app, and the deployed PWA's service worker must never see it.
// Build it with `npm run lab:build` when you want a static copy.
const input = process.env.LAB ? { main: 'index.html', lab: 'lab/index.html' } : undefined;

export default defineConfig({
  server: { host: true },
  plugins: [tailwindcss()],
  build: { rollupOptions: { input } },
});
