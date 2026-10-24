import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Guardify Safety',
        short_name: 'Guardify',
        description: 'Consent-first personal safety and emergency coordination.',
        theme_color: '#6d1836',
        background_color: '#fff9fb',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/api/v1/sos'),
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: { name: 'guardify-sos-queue', options: { maxRetentionTime: 1440 } }
            }
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@firebase')) return 'firebase';
          if (id.includes('node_modules/leaflet')) return 'maps';
          if (id.includes('node_modules/vue')) return 'vue';
          return undefined;
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/lib/api.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 }
    }
  }
});
