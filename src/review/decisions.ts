// What the review page remembers between sessions: which recording of each
// phrase is the one to use, which recordings are no good, and whose voice is
// hidden from the page.
//
// Kept in audio-review.json at the top of the repo, which is committed: the
// recordings themselves can be fetched again, but a listening decision can't.
// The file is small and hand-editable, so parseDecisions takes anything
// sensible and ignores the rest.
//
// Plain data and plain functions, no browser and no filesystem: the page edits
// decisions here and the dev server applies the same patch before writing the
// file (scripts/reviewRecordings.ts), so the two can't drift.

export const DECISIONS_VERSION = 1

/** 'generated' is the Polly clip the app plays today; anything else is a contributor id. */
export const GENERATED = 'generated'

export interface PhraseDecision {
  /** The source to use for this phrase. Absent means it hasn't been decided. */
  pick?: string
  /** Sources that are no good: a misread word, a noise, a bad take. */
  bad?: string[]
  /** When this phrase was last decided, ISO 8601. */
  updated?: string
}

export interface Decisions {
  version: number
  /** Contributors left out of the page: their recordings aren't shown or played. */
  hiddenVoices: string[]
  /** Keyed by `<module>/<item>_<variant>.wav`, the same key as phraseKey. */
  phrases: Record<string, PhraseDecision>
}

export type Patch =
  | { type: 'pick'; phrase: string; source: string | null }
  | { type: 'bad'; phrase: string; source: string; bad: boolean }
  | { type: 'hide'; contributor: string; hidden: boolean }

export function emptyDecisions(): Decisions {
  return { version: DECISIONS_VERSION, hiddenVoices: [], phrases: {} }
}

export function pickOf(decisions: Decisions, phrase: string): string | undefined {
  return decisions.phrases[phrase]?.pick
}

export function isBad(decisions: Decisions, phrase: string, source: string): boolean {
  return decisions.phrases[phrase]?.bad?.includes(source) ?? false
}

export function isHidden(decisions: Decisions, contributor: string): boolean {
  return decisions.hiddenVoices.includes(contributor)
}

/**
 * The decisions with one change applied, as a new object.
 *
 * Picking a source clears any mark against it, and marking the picked source
 * bad takes the pick away: holding both at once would only mean one of them was
 * stale. A phrase with nothing left to say about it is dropped, so a phrase
 * missing from the file is one nobody has looked at.
 */
export function applyPatch(decisions: Decisions, patch: Patch, now = new Date().toISOString()): Decisions {
  if (patch.type === 'hide') {
    const others = decisions.hiddenVoices.filter((c) => c !== patch.contributor)
    return { ...decisions, hiddenVoices: (patch.hidden ? [...others, patch.contributor] : others).sort() }
  }

  const was = decisions.phrases[patch.phrase] ?? {}
  const bad = new Set(was.bad ?? [])
  let pick = was.pick

  if (patch.type === 'pick') {
    pick = patch.source ?? undefined
    if (patch.source) bad.delete(patch.source)
  } else if (patch.bad) {
    bad.add(patch.source)
    if (pick === patch.source) pick = undefined
  } else {
    bad.delete(patch.source)
  }

  const decision: PhraseDecision = {
    ...(pick ? { pick } : {}),
    ...(bad.size ? { bad: [...bad].sort() } : {}),
    updated: now,
  }
  const phrases = { ...decisions.phrases }
  if (decision.pick || decision.bad) phrases[patch.phrase] = decision
  else delete phrases[patch.phrase]
  return { ...decisions, phrases }
}

/** Decisions from a file or a request body, keeping only what makes sense. */
export function parseDecisions(value: unknown): Decisions {
  const raw = (value ?? {}) as Partial<Decisions>
  const decisions = emptyDecisions()
  if (Array.isArray(raw.hiddenVoices)) {
    decisions.hiddenVoices = [...new Set(raw.hiddenVoices.filter((c) => typeof c === 'string'))].sort()
  }
  for (const [phrase, entry] of Object.entries(raw.phrases ?? {})) {
    const { pick, bad, updated } = (entry ?? {}) as PhraseDecision
    const kept: PhraseDecision = {
      ...(typeof pick === 'string' ? { pick } : {}),
      ...(Array.isArray(bad) && bad.length ? { bad: [...new Set(bad.filter((s) => typeof s === 'string'))].sort() } : {}),
      ...(typeof updated === 'string' ? { updated } : {}),
    }
    if (kept.pick || kept.bad) decisions.phrases[phrase] = kept
  }
  return decisions
}

/** One change from a request body, or null if it isn't one. */
export function parsePatch(value: unknown): Patch | null {
  const raw = (value ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length < 200 ? v : null)
  if (raw.type === 'hide') {
    const contributor = str(raw.contributor)
    return contributor && typeof raw.hidden === 'boolean' ? { type: 'hide', contributor, hidden: raw.hidden } : null
  }
  const phrase = str(raw.phrase)
  if (!phrase) return null
  if (raw.type === 'pick') {
    if (raw.source === null) return { type: 'pick', phrase, source: null }
    const source = str(raw.source)
    return source ? { type: 'pick', phrase, source } : null
  }
  if (raw.type === 'bad') {
    const source = str(raw.source)
    return source && typeof raw.bad === 'boolean' ? { type: 'bad', phrase, source, bad: raw.bad } : null
  }
  return null
}

/** Stable JSON for the file: phrases in key order, so a diff shows what changed. */
export function serialiseDecisions(decisions: Decisions): string {
  const phrases = Object.fromEntries(Object.entries(decisions.phrases).sort(([a], [b]) => a.localeCompare(b)))
  return `${JSON.stringify({ version: DECISIONS_VERSION, hiddenVoices: [...decisions.hiddenVoices].sort(), phrases }, null, 2)}\n`
}
