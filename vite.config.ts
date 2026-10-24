import { defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'
import { join } from 'node:path'
import { recordingsReview } from './scripts/reviewRecordings'

const buildDate = new Date().toISOString().slice(0, 10)
const buildCommit = execSync('git rev-parse --short HEAD').toString().trim()

// The service worker caches the config Lambda's GET responses, so the last known
// config is served offline. The pattern follows VITE_MODULES_API_URL, which differs
// between production, local dev (the /modules-api proxy) and the e2e build's fake.
function configCaching(apiUrl: string | undefined) {
  if (!apiUrl) return []
  const escaped = apiUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [
    {
      // Workbox matches cross-origin regexes from the start of the URL, and
      // same-origin ones anywhere in it.
      urlPattern: new RegExp(apiUrl.startsWith('/') ? escaped : `^${escaped}`),
      handler: 'NetworkFirst' as const,
      options: {
        cacheName: 'module-config',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 1 },
      },
    },
  ]
}

export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  base: '/',
  build: {
    rolldownOptions: {
      // record.html is the page contributors' links open; see src/record/main.tsx.
      input: { main: 'index.html', record: 'record.html' },
    },
  },
  server: {
    proxy: {
      '/modules-api': {
        target: 'https://6wup3s4xsica4mfyglrdzsvevu0gmjjy.lambda-url.us-east-1.on.aws',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/modules-api/, ''),
      },
    },
  },
  plugins: [
    react(),
    // Dev only: serves recordings/ and the prepared copies to review.html, and
    // keeps the decisions file. None of it is in the build.
    recordingsReview({
      dir: join(import.meta.dirname, 'recordings'),
      preparedDir: join(import.meta.dirname, 'recordings-prepared'),
      decisionsFile: join(import.meta.dirname, 'audio-review.json'),
      exportFile: join(import.meta.dirname, 'recordings-prepared', 'picks.json'),
    }),
    VitePWA({
      registerType: 'prompt',
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
        // Control the page from the very first load so the module-config
        // runtime cache is populated before the user ever goes offline.
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,json}'],
        // The contributor page isn't part of the app. Without the denylist the
        // worker would answer a learner's device opening a contributor link with
        // the app's index.html.
        globIgnores: ['**/node_modules/**/*', 'record.html'],
        navigateFallbackDenylist: [/^\/record\.html/],
        runtimeCaching: configCaching(loadEnv(mode, process.cwd(), 'VITE_').VITE_MODULES_API_URL),
      },
    }),
    // The PWA plugin links the app manifest from every page. On the pages that
    // aren't the learner app that would offer to install it, so take it out there.
    {
      name: 'other-pages-without-manifest',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) =>
          ctx.path === '/record.html' || ctx.path === '/review.html' ? html.replace(/\s*<link rel="manifest"[^>]*>/, '') : html,
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // e2e/ is Playwright's; see playwright.config.ts
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
}))
