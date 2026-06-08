import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: { host: true },
  plugins: [tailwindcss()],
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'm',
    jsxFragment: "'['",
  },
});
