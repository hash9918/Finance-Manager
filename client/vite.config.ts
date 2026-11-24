import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icons/icon-192.svg', 'icons/apple-touch-icon.png'],
    manifest: {
      name: 'Personal Money Manager', short_name: 'Money', description: 'Offline capable personal finance manager',
      theme_color: '#0f172a', background_color: '#f8fafc', display: 'standalone', start_url: '/',
      icons: [{ src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' }]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      navigateFallback: '/index.html',
      // Financial API responses are deliberately not cached by the service worker.
      runtimeCaching: [{ urlPattern: /\/api\/v1\//, handler: 'NetworkOnly' }]
    }
  })],
  server: { proxy: { '/api': 'http://localhost:4000' } }
});
