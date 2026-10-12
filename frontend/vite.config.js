import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Dhaka Blinds - ERP & IMS Portal',
        short_name: 'Dhaka Blinds',
        description: 'Inventory Management System & ERP Portal for Dhaka Blinds',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
})
