// What the review page knows about the audio for one phrase: the generated clip
// the app plays today, every contributor's recording of it, and what has been
// decided about them (src/review/decisions.ts).

import { clipWarnings, phraseKey, type Phrase } from '../recorder/script'
import { GENERATED, isBad, isHidden, pickOf, type Decisions } from './decisions'

/** What scripts/prepareRecordings.ts made of a recording: trimmed and levelled. */
export interface PreparedClip {
  durationMs: number
  peakDb: number
  rmsDb: number
  leadMs: number
  tailMs: number
  gainDb: number
  cutLeadMs: number
  cutTailMs: number
  note?: string
}

export interface Clip {
  contributor: string
  module: string
  file: string
  bytes: number
  recorded: string
  durationMs: number
  peakDb: number
  rmsDb: number
  leadMs: number
  tailMs: number
  prepared?: PreparedClip
}

export interface Option {
  /** 'generated' is the Polly clip in public/content; otherwise the contributor's id. */
  source: string
  /** The prepared clip where there is one, so what you hear is what the app would get. */
  url: string
  /** The clip as it was recorded, for checking a trim that sounds wrong. */
  originalUrl: string
  clip?: Clip
  warnings: string[]
  picked: boolean
  bad: boolean
  /** This contributor's voice is hidden, so the page leaves the option out. */
  hidden: boolean
}

export interface Row {
  phrase: Phrase
  /** Every option, hidden ones included: a pick still counts while its voice is hidden. */
  options: Option[]
  /** The options the page shows. */
  visible: Option[]
  /** Visible recordings, so the generated clip isn't counted. */
  recorded: number
  /** Recordings left out because their voice is hidden. */
  hidden: number
  /** The source picked for this phrase, if one has been. */
  pick?: string
  /** A recording that is neither picked nor marked bad: something still to listen to. */
  undecided: boolean
}

export type PlayWhich = 'prepared' | 'original'

/** Every phrase with its audio options, generated first then one per contributor. */
export function buildRows(phrases: Phrase[], clips: Clip[], decisions: Decisions): Row[] {
  const byPhrase = new Map<string, Clip[]>()
  for (const clip of clips) {
    const key = phraseKey(clip)
    byPhrase.set(key, [...(byPhrase.get(key) ?? []), clip])
  }

  return phrases.map((phrase) => {
    const key = phraseKey(phrase)
    const pick = pickOf(decisions, key)
    const recordings = (byPhrase.get(key) ?? []).sort((a, b) => a.contributor.localeCompare(b.contributor))
    const generatedUrl = `/content/${phrase.module}/audio/${phrase.file.replace(/\.wav$/, '.mp3')}`
    const options: Option[] = [
      {
        source: GENERATED,
        url: generatedUrl,
        originalUrl: generatedUrl,
        warnings: [],
        picked: pick === GENERATED,
        bad: isBad(decisions, key, GENERATED),
        hidden: false,
      },
      ...recordings.map((clip) => {
        const path = `${clip.contributor}/${clip.module}/${clip.file}`
        return {
          source: clip.contributor,
          // Measured on the prepared clip where there is one: trimming is what
          // takes a clip that was only long because of its silence back under.
          url: clip.prepared ? `/prepared/${path}` : `/recordings/${path}`,
          originalUrl: `/recordings/${path}`,
          clip,
          warnings: clipWarnings(phrase, { durationMs: clip.prepared?.durationMs ?? clip.durationMs, peakDb: clip.peakDb }),
          picked: pick === clip.contributor,
          bad: isBad(decisions, key, clip.contributor),
          hidden: isHidden(decisions, clip.contributor),
        }
      }),
    ]
    const visible = options.filter((o) => !o.hidden)
    return {
      phrase,
      options,
      visible,
      recorded: visible.filter((o) => o.clip).length,
      hidden: options.filter((o) => o.hidden).length,
      ...(pick ? { pick } : {}),
      undecided: !pick && visible.some((o) => o.clip && !o.bad),
    }
  })
}

export type Show = 'all' | 'recorded' | 'missing' | 'problems' | 'undecided' | 'picked'

export function filterRows(rows: Row[], { module, show }: { module: string; show: Show }): Row[] {
  return rows.filter((row) => {
    if (module !== 'all' && row.phrase.module !== module) return false
    if (show === 'recorded') return row.recorded > 0
    if (show === 'missing') return row.recorded === 0
    if (show === 'problems') return row.visible.some((o) => o.warnings.length > 0)
    if (show === 'undecided') return row.undecided
    if (show === 'picked') return row.pick !== undefined
    return true
  })
}

export interface Progress {
  /** Phrases with at least one visible recording. */
  recorded: number
  picked: number
  /** Recorded phrases with something still to listen to. */
  undecided: number
  /** Recordings marked bad, across every phrase. */
  bad: number
}

export function progress(rows: Row[]): Progress {
  return {
    recorded: rows.filter((r) => r.recorded > 0).length,
    picked: rows.filter((r) => r.pick !== undefined).length,
    undecided: rows.filter((r) => r.undecided).length,
    bad: rows.reduce((total, r) => total + r.options.filter((o) => o.bad).length, 0),
  }
}

export interface ExportPick {
  /** The phrase, as `<module>/<item>_<variant>.wav`. */
  phrase: string
  module: string
  item: string
  variant: string
  text: string
  /** The file the app plays for this phrase. */
  target: string
  /** 'generated' to keep the Polly clip, otherwise the contributor to take it from. */
  source: string
  /** The chosen recording, as `<contributor>/<module>/<file>`. */
  clip?: string
}

export interface ExportSet {
  picked: ExportPick[]
  /** Phrases with a recording nobody has decided on yet. */
  undecided: string[]
  /** Phrases where every recording is marked bad. */
  allBad: string[]
  /** Phrases nobody has recorded. */
  unrecorded: string[]
}

/**
 * The chosen set: one line per decided phrase, and what is still open. The
 * import step that turns recordings into the app's mp3s reads this, so it
 * carries the target filename and needs to know nothing about reviewing.
 */
export function buildExport(rows: Row[]): ExportSet {
  const set: ExportSet = { picked: [], undecided: [], allBad: [], unrecorded: [] }
  for (const row of rows) {
    const key = phraseKey(row.phrase)
    const pick = row.options.find((o) => o.picked)
    if (pick) {
      set.picked.push({
        phrase: key,
        module: row.phrase.module,
        item: row.phrase.id,
        variant: row.phrase.variant,
        text: row.phrase.text,
        target: row.phrase.file.replace(/\.wav$/, '.mp3'),
        source: pick.source,
        ...(pick.clip ? { clip: `${pick.clip.contributor}/${pick.clip.module}/${pick.clip.file}` } : {}),
      })
    } else if (row.recorded === 0) set.unrecorded.push(key)
    else if (row.undecided) set.undecided.push(key)
    else set.allBad.push(key)
  }
  return set
}

export interface Voice {
  contributor: string
  clips: number
  /** Middle value, so one loud or quiet clip doesn't move it. */
  medianPeakDb: number
  medianRmsDb: number
  /** How many of this voice's recordings are picked, and how many marked bad. */
  picked: number
  bad: number
  hidden: boolean
}

/** One line per contributor: how much they have recorded, how loud, and how it fared. */
export function voices(clips: Clip[], rows: Row[], decisions: Decisions): Voice[] {
  const byContributor = new Map<string, Clip[]>()
  for (const clip of clips) byContributor.set(clip.contributor, [...(byContributor.get(clip.contributor) ?? []), clip])

  const picked = new Map<string, number>()
  const bad = new Map<string, number>()
  for (const row of rows) {
    for (const option of row.options) {
      if (!option.clip) continue
      if (option.picked) picked.set(option.source, (picked.get(option.source) ?? 0) + 1)
      if (option.bad) bad.set(option.source, (bad.get(option.source) ?? 0) + 1)
    }
  }

  return [...byContributor.entries()]
    .map(([contributor, list]) => ({
      contributor,
      clips: list.length,
      medianPeakDb: median(list.map((c) => c.peakDb)),
      medianRmsDb: median(list.map((c) => c.rmsDb)),
      picked: picked.get(contributor) ?? 0,
      bad: bad.get(contributor) ?? 0,
      hidden: isHidden(decisions, contributor),
    }))
    .sort((a, b) => a.contributor.localeCompare(b.contributor))
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(value * 10) / 10
}
