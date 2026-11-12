/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Rutas relativas: el sitio funciona en la raíz de un dominio o en una subcarpeta
  // (Netlify, Vercel, GitHub Pages) sin configurar nada más.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // El registro se hace en main.tsx y solo en la web: la APK ya trae todo y no necesita service worker.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ParkSmart Arkadia',
        short_name: 'ParkSmart',
        description: 'Modelamiento y simulación del flujo vehicular en los accesos al parqueadero del Centro Comercial Arkadia.',
        lang: 'es-CO',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#10284A',
        theme_color: '#10284A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo queda en caché para funcionar sin conexión, incluido SQLite (wasm) y el generador de PDF.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
