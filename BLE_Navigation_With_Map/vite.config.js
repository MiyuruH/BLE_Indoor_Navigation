import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Show an "update available" prompt instead of silently reloading
      registerType: 'prompt',
      injectRegister: false, // registered manually in src/pwa/PwaControls.jsx
      // VS Code port forwarding (dev tunnels) protects every request with a login cookie.
      // Browsers fetch the manifest WITHOUT cookies by default, so the tunnel answers with a
      // login redirect, the manifest fails and Chrome refuses to offer "Install app".
      // This adds crossorigin="use-credentials" to the <link rel="manifest"> tag.
      useCredentials: true,
      includeAssets: ['icons/favicon-64x64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Indoor Navigation - Smart Room Tracker',
        short_name: 'Indoor Nav',
        description:
          'BLE-based indoor navigation with an interactive campus map. Works fully offline once installed.',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#060d1a',
        theme_color: '#060d1a',
        categories: ['navigation', 'utilities', 'education'],
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app shell so it runs with no internet connection
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,json,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/(\?.*)?$/, /^\/index\.html(\?.*)?$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        // Must be 'classic' for generateSW because Workbox's dev sw.js uses importScripts().
        // Using 'module' causes Service Worker registration to fail in Chrome, preventing PWA install.
        type: 'classic',
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(\?.*)?$/, /^\/index\.html(\?.*)?$/],
      },
    }),
  ],
  // Allow access through VS Code port forwarding / dev tunnels and the local network
  server: {
    host: true,
    allowedHosts: ['.devtunnels.ms', '.github.dev'],
  },
  preview: {
    host: true,
    allowedHosts: ['.devtunnels.ms', '.github.dev'],
  },
})
