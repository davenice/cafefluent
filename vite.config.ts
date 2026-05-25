import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

const buildDate = new Date().toISOString().slice(0, 10)
const buildCommit = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'content/**/*'],
      manifest: {
        name: 'CafeFluent',
        short_name: 'CafeFluent',
        description: 'Learn the language of the cafe',
        theme_color: '#1a1a2e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,json}'],
      },
    }),
  ],
})
