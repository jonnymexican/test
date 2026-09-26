import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Injects the built, content-hashed asset files into the service worker's
 * precache list, so offline installs cover the whole app shell from day one.
 */
function swPrecache() {
  return {
    name: 'sw-precache',
    closeBundle() {
      const html = readFileSync(join('dist', 'index.html'), 'utf8');
      const assets = [...new Set(html.match(/assets\/[\w.-]+\.(?:js|css)/g) ?? [])];
      const lines = assets.map((f) => `'./${f}'`).join(',\n  ');
      const swPath = join('dist', 'sw.js');
      const sw = readFileSync(swPath, 'utf8').replace(
        "'./icon.svg',",
        `'./icon.svg',\n  ${lines},`
      );
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), swPrecache()],
  server: { port: 3001 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    globals: true,
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
