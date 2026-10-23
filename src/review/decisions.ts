// What the review page remembers between sessions: which recording of each
// phrase is the one to use, which recordings are no good, and whose voice is
// hidden from the page.
//
// Kept in audio-review.json at the top of the repo, which is committed: the
// recordings themselves can be fetched again, but a listening decision can't.
// The file is small and hand-editable, so parseDecisions takes anything
// sensible and ignores the rest.
//
// A contributor's id is their name plus six random characters, and the repo is
// public, so the file names voices by those six characters alone and the dev
// server puts the names back on the way out (see voiceAliases). Nothing a
// volunteer is called ends up committed.
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

/**
 * The random part of a contributor id: the six characters the recordings
 * function adds to their name (`amira-k-3f9a1c` → `3f9a1c`). Anything not shaped
 * like one of its ids is left alone, so a folder put in recordings/ by hand
 * still works — under whatever it is called.
 */
export function voiceAlias(contributor: string): string {
  return /-([0-9a-f]{6})$/.exec(contributor)?.[1] ?? contributor
}

export interface VoiceAliases {
  /** What the file says → the contributor id the page and the clips use. */
  expand: Record<string, string>
  /** The other way, for writing the file. */
  collapse: Record<string, string>
}

/**
 * The two-way map between contributor ids and what stands for them in the file.
 *
 * Throws if two contributors share those six characters, rather than write a
 * file where one voice's decisions could be read back as another's. The
 * recordings function draws them at random from three bytes and checks the whole
 * id is new, so for a handful of voices this is a one-in-a-million event with a
 * clear way out: rename one of them in the bucket.
 */
export function voiceAliases(contributors: string[]): VoiceAliases {
  const expand: Record<string, string> = {}
  const collapse: Record<string, string> = {}
  for (const contributor of contributors) {
    const alias = voiceAlias(contributor)
    const clash = expand[alias]
    if (clash !== undefined && clash !== contributor) {
      throw new Error(`${clash} and ${contributor} would both be "${alias}" in the decisions. Rename one of them.`)
    }
    expand[alias] = contributor
    collapse[contributor] = alias
  }
  return { expand, collapse }
}

/**
 * The decisions with every voice renamed through `map`. Anything the map doesn't
 * cover is kept as it is: 'generated' is not a voice, and a decision about a
 * voice whose recordings aren't here is still a decision worth keeping.
 */
export function renameVoices(decisions: Decisions, map: Record<string, string>): Decisions {
  const rename = (source: string) => map[source] ?? source
  return {
    ...decisions,
    hiddenVoices: decisions.hiddenVoices.map(rename).sort(),
    phrases: Object.fromEntries(
      Object.entries(decisions.phrases).map(([phrase, { pick, bad, updated }]) => [
        phrase,
        {
          ...(pick ? { pick: rename(pick) } : {}),
          ...(bad ? { bad: bad.map(rename).sort() } : {}),
          ...(updated ? { updated } : {}),
        },
      ]),
    ),
  }
}

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
