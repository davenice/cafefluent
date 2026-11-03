// Where the review page gets its clips and puts its decisions. There are two:
//
// - `dev`: the Vite dev server (scripts/reviewRecordings.ts) reads the clips off
//   your disk and writes audio-review.json as you go.
// - `bundle`: the offline zip (scripts/bundleReview.ts). Everything is inlined
//   into the page, because fetch() is refused on file:// in every current
//   browser, and decisions are kept in the browser and downloaded at the end.
//
// The page is the same either way, so the second reviewer sees what you see.

import { loadScript, type Phrase } from '../recorder/script'
import { bundleStoreKey, type BundleData } from './bundle'
import { buildExport, type Clip, type Row } from './clips'
import {
  applyPatch,
  parseDecisions,
  serialiseDecisions,
  type Decisions,
  type Patch,
} from './decisions'

/** Everything the page needs to draw itself. */
export interface Loaded {
  phrases: Phrase[]
  clips: Clip[]
  /** When the prepare step last ran, or null if it hasn't. */
  prepared: { at: string } | null
  decisions: Decisions
  /** Whether the untrimmed takes are here to play. The bundle ships prepared only. */
  originals: boolean
}

export interface ReviewBackend {
  kind: 'dev' | 'bundle'
  load(): Promise<Loaded>
  /** Apply one decision and keep it. Answers with the decisions as they now stand. */
  save(patch: Patch): Promise<Decisions>
  /** What the button that finishes a round says. */
  exportLabel: string
  /** Finish a round, answering with a line to show. */
  exportPicks(rows: Row[], decisions: Decisions): Promise<string>
}

/** The bundle's backend if the page was built into one, the dev server's otherwise. */
export function pickBackend(): ReviewBackend {
  const bundled = bundleData()
  return bundled ? bundleBackend(bundled) : devBackend()
}

// ---------------------------------------------------------------- dev server

export function devBackend(): ReviewBackend {
  return {
    kind: 'dev',
    load: async () => {
      const [phrases, review] = await Promise.all([loadScript(), fetchReview()])
      return { phrases, ...review }
    },
    save: async (patch) => parseDecisions((await postJson<{ decisions: unknown }>('/recordings-api/decisions', patch)).decisions),
    exportLabel: 'Export picks',
    exportPicks: async (rows) => {
      const { file, picked } = await postJson<{ file: string; picked: number }>('/recordings-api/export', buildExport(rows))
      return `Wrote ${picked} picks to ${file}`
    },
  }
}

async function fetchReview(): Promise<Omit<Loaded, 'phrases'>> {
  const res = await fetch('/recordings-api/review.json')
  if (!res.ok) throw new Error(`the dev server answered ${res.status}`)
  const body = (await res.json()) as { clips?: Clip[]; prepared?: { at: string } | null; decisions?: unknown }
  return {
    clips: body.clips ?? [],
    prepared: body.prepared ?? null,
    decisions: parseDecisions(body.decisions),
    // The dev server serves recordings/ as well as the prepared copies.
    originals: true,
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const answer = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(answer.error ?? `the dev server answered ${res.status}`)
  return answer as T
}

// -------------------------------------------------------------- offline zip

export type { BundleData }

/** The data scripts/bundleReview.ts inlined into this page, if it is a bundle. */
export function bundleData(): BundleData | null {
  return (globalThis as { __REVIEW__?: BundleData }).__REVIEW__ ?? null
}

/**
 * Review with no server behind the page.
 *
 * Decisions live in this browser and are only really saved once they are
 * downloaded, which is what comes back to the project. localStorage keeps them
 * across a closed tab where the browser allows it, under a key naming the
 * bundle, so going back to an earlier one still finds its own work.
 */
export function bundleBackend(data: BundleData, store: Store = localStore()): ReviewBackend {
  const key = bundleStoreKey(data.made)
  // Whatever this browser has already decided about this bundle, else what it was sent.
  let decisions = parseDecisions(stored(store, key) ?? data.decisions)

  return {
    kind: 'bundle',
    load: async () => ({
      phrases: data.phrases,
      clips: data.clips,
      prepared: data.prepared,
      decisions,
      // Prepared clips only, to keep the download down; see README.
      originals: false,
    }),
    save: async (patch) => {
      decisions = applyPatch(decisions, patch)
      store.set(key, serialiseDecisions(decisions))
      return decisions
    },
    exportLabel: 'Download decisions',
    exportPicks: async (_rows, current) => {
      download('audio-review.json', serialiseDecisions(current))
      return 'Downloaded audio-review.json. Send that file back to finish.'
    },
  }
}

/** What the store holds for this bundle, or null if there is nothing usable. */
function stored(store: Store, key: string): unknown {
  const text = store.get(key)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // Not worth stopping the review over: start from what the bundle was sent with.
    return null
  }
}

/** Just enough of localStorage to stand in for it in a test. */
export interface Store {
  get(key: string): string | null
  set(key: string, value: string): void
}

/**
 * localStorage where it works. It throws or comes back empty in a private
 * window and with site data blocked, and on file:// some browsers refuse it
 * outright, so nothing here depends on it: the download is the real output.
 */
export function localStore(): Store {
  return {
    get: (key) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Nothing to do: the page keeps the decisions in memory either way.
      }
    },
  }
}

/** Hand the file to the browser. The only way out of the bundle. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
