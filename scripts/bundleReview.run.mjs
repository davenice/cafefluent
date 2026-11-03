// `npm run bundle:review`.
//
// bundleReview.ts reuses the app's own module list and phrase builder, so that
// the bundle asks about exactly the phrases the recorder asked for. Those files
// import each other without file extensions, which Node won't resolve, so the
// script is loaded through Vite instead — the same resolution the app gets.

import { join } from 'node:path'
import { createServer } from 'vite'

const root = join(import.meta.dirname, '..')

// No config file: the app's own has the dev-only review middleware and the PWA
// plugin in it, and this is not the app.
const server = await createServer({
  configFile: false,
  root,
  logLevel: 'warn',
  server: { middlewareMode: true },
  // Nothing here is served to a browser, and a scan would try to crawl the app's
  // own pages, which need plugins this config deliberately leaves out.
  optimizeDeps: { noDiscovery: true, include: [] },
})

try {
  const { main } = await server.ssrLoadModule('/scripts/bundleReview.ts')
  await main(root)
} finally {
  await server.close()
}
