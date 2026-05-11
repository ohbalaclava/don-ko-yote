import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'm',
    jsxFragment: "'['",
  },
});
