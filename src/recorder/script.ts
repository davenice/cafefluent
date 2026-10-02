// The list of phrases to record: every audio clip the app plays, in the same
// order and with the same filenames as scripts/generate-audio.mjs.

import { MODULES } from '../data/modules'
import { SENTENCE_TEMPLATES, SENTENCE_VARIANTS, type SentenceVariant } from '../data/sentenceVariants'

export interface Phrase {
  module: string
  moduleTitle: string
  id: string
  variant: string
  text: string
  /** Recording filename; the import step turns `<id>_<variant>.wav` into the app's `.mp3`. */
  file: string
}

interface Spoken {
  id: string
  name?: string
  label?: string
  audioName?: string
  variants?: string[]
}

export interface ScriptModuleData {
  variants?: string[]
  items?: Spoken[]
  diagrams?: { hotspots: Spoken[] }[]
}

function phraseText(variant: string, spokenName: string): string {
  if (variant === 'name') return spokenName.charAt(0).toUpperCase() + spokenName.slice(1)
  return SENTENCE_TEMPLATES[variant as SentenceVariant](spokenName)
}

export function buildScript(modules: { id: string; title: string; data: ScriptModuleData }[]): Phrase[] {
  const phrases: Phrase[] = []
  for (const { id: module, title: moduleTitle, data } of modules) {
    const variants = data.variants ?? ['name', ...SENTENCE_VARIANTS]
    const jobs = [
      ...(data.items ?? []).map((item) => ({ id: item.id, spoken: item.audioName ?? item.name ?? '', variants: item.variants ?? variants })),
      ...(data.diagrams ?? []).flatMap((d) =>
        d.hotspots.map((h) => ({ id: h.id, spoken: h.audioName ?? h.label ?? '', variants: ['name'] })),
      ),
    ]
    for (const job of jobs) {
      for (const variant of job.variants) {
        phrases.push({
          module,
          moduleTitle,
          id: job.id,
          variant,
          text: phraseText(variant, job.spoken),
          file: `${job.id}_${variant}.wav`,
        })
      }
    }
  }
  return phrases
}

/** Fetch every module that has audio and build the phrase list. */
export async function loadScript(): Promise<Phrase[]> {
  const withAudio = MODULES.filter((m) => m.audioBase)
  const modules = await Promise.all(
    withAudio.map(async (m) => ({ id: m.id, title: m.title, data: (await (await fetch(m.dataUrl)).json()) as ScriptModuleData })),
  )
  return buildScript(modules)
}

/**
 * The order to ask for phrases in: a shuffle seeded by the speaker's name. Each
 * speaker gets a different order, so if several people only get part way
 * through, between them they cover more phrases. The same speaker always gets
 * the same order, so resuming carries on where they left off.
 */
export function speakerOrder(count: number, speaker: string): number[] {
  // FNV-1a hash of the name seeds a mulberry32 generator.
  let seed = 0x811c9dc5
  for (let i = 0; i < speaker.length; i++) seed = Math.imul(seed ^ speaker.charCodeAt(i), 0x01000193)
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function phraseKey(p: { module: string; file: string }): string {
  return `${p.module}/${p.file}`
}

export interface ClipInfo {
  durationMs: number
  peakDb: number
}

/** Things worth a listen in the review list. Silence detection can't tell a misread word. */
export function clipWarnings(phrase: Phrase, clip: ClipInfo): string[] {
  const warnings: string[] = []
  const words = phrase.text.split(/\s+/).length
  if (clip.durationMs > 1500 + 700 * words) warnings.push('Long for the words')
  if (clip.peakDb < -30) warnings.push('Quiet')
  if (clip.peakDb > -0.5) warnings.push('May be distorted')
  return warnings
}
