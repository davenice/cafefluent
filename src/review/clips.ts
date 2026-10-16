// What the review page knows about the audio for one phrase: the generated
// clip the app plays today, and every contributor's recording of it.

import { clipWarnings, phraseKey, type Phrase } from '../recorder/script'

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
}

export interface Option {
  /** 'generated' is the Polly clip in public/content; otherwise the contributor's id. */
  source: string
  url: string
  clip?: Clip
  warnings: string[]
}

export interface Row {
  phrase: Phrase
  options: Option[]
  /** Contributors' recordings only: the generated clip is always there. */
  recorded: number
}

/** Every phrase with its audio options, generated first then one per contributor. */
export function buildRows(phrases: Phrase[], clips: Clip[]): Row[] {
  const byPhrase = new Map<string, Clip[]>()
  for (const clip of clips) {
    const key = phraseKey(clip)
    byPhrase.set(key, [...(byPhrase.get(key) ?? []), clip])
  }

  return phrases.map((phrase) => {
    const recordings = (byPhrase.get(phraseKey(phrase)) ?? []).sort((a, b) => a.contributor.localeCompare(b.contributor))
    const options: Option[] = [
      {
        source: 'generated',
        url: `/content/${phrase.module}/audio/${phrase.file.replace(/\.wav$/, '.mp3')}`,
        warnings: [],
      },
      ...recordings.map((clip) => ({
        source: clip.contributor,
        url: `/recordings/${clip.contributor}/${clip.module}/${clip.file}`,
        clip,
        warnings: clipWarnings(phrase, clip),
      })),
    ]
    return { phrase, options, recorded: recordings.length }
  })
}

export type Show = 'all' | 'recorded' | 'missing' | 'problems'

export function filterRows(rows: Row[], { module, show }: { module: string; show: Show }): Row[] {
  return rows.filter((row) => {
    if (module !== 'all' && row.phrase.module !== module) return false
    if (show === 'recorded') return row.recorded > 0
    if (show === 'missing') return row.recorded === 0
    if (show === 'problems') return row.options.some((o) => o.warnings.length > 0)
    return true
  })
}

export interface Voice {
  contributor: string
  clips: number
  /** Middle value, so one loud or quiet clip doesn't move it. */
  medianPeakDb: number
  medianRmsDb: number
}

/** One line per contributor: how much they have recorded and how loud it is. */
export function voices(clips: Clip[]): Voice[] {
  const byContributor = new Map<string, Clip[]>()
  for (const clip of clips) byContributor.set(clip.contributor, [...(byContributor.get(clip.contributor) ?? []), clip])

  return [...byContributor.entries()]
    .map(([contributor, list]) => ({
      contributor,
      clips: list.length,
      medianPeakDb: median(list.map((c) => c.peakDb)),
      medianRmsDb: median(list.map((c) => c.rmsDb)),
    }))
    .sort((a, b) => a.contributor.localeCompare(b.contributor))
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(value * 10) / 10
}
