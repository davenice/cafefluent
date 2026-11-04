// What the offline review bundle carries, and where a browser keeps the work
// done in one.
//
// Plain data, no browser and no filesystem, for the same reason as
// decisions.ts: scripts/bundleReview.ts writes this and src/review/backend.ts
// reads it, so the shape has to belong to neither.

import type { Phrase } from '../recorder/script'
import type { Clip } from './clips'

/**
 * Inlined into the page by scripts/bundleReview.ts, because a `file://` page is
 * refused when it tries to fetch anything beside it.
 *
 * Voices are named by their six characters alone, as the decisions file names
 * them: the bundle goes to someone outside the project, so no volunteer's name
 * is in it. That also means the decisions that come back need no translating.
 */
export interface BundleData {
  /** When the bundle was made, ISO 8601. Also what its saved decisions are kept under. */
  made: string
  phrases: Phrase[]
  clips: Clip[]
  /** When the prepare step ran for these clips. */
  prepared: { at: string } | null
  /** The decisions as committed, for a second round to start from. */
  decisions: unknown
}

/**
 * Where a browser holds the decisions made in one bundle. Named after the
 * bundle, so going back to an earlier copy still finds its own work rather
 * than a later round's.
 */
export function bundleStoreKey(made: string): string {
  return `cafefluent.audio-review.${made}`
}
