/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * La presentación vive en /presentacion/ y el plugin PWA enlaza el manifiesto relativo
 * a cada página: desde ahí hay que subir un nivel para llegar a /manifest.webmanifest.
 */
const subpageManifestLink = (): Plugin => ({
  name: 'parksmart-subpage-manifest-link',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler: (html, ctx) =>
      /[\\/]presentacion[\\/]index\.html$/.test(ctx.filename) ? html.replace(/href="\.\/manifest\.webmanifest"/, 'href="../manifest.webmanifest"') : html,
  },
})

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
        // La presentación es otra página: nunca se responde con la app en su lugar.
        navigateFallbackDenylist: [/^\/presentacion/],
      },
    }),
    subpageManifestLink(),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
    // Dos páginas: la aplicación en la raíz y la presentación del proyecto en /presentacion/.
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        presentacion: resolve(import.meta.dirname, 'presentacion/index.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
