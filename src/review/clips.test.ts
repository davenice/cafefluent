import { buildRows, filterRows, median, voices, type Clip } from './clips'
import type { Phrase } from '../recorder/script'

const phrase = (module: string, id: string, variant: string, text: string): Phrase => ({
  module,
  moduleTitle: module === 'bread' ? 'Bread' : 'Allergens',
  id,
  variant,
  text,
  file: `${id}_${variant}.wav`,
})

const clip = (contributor: string, module: string, file: string, over: Partial<Clip> = {}): Clip => ({
  contributor,
  module,
  file,
  bytes: 40000,
  recorded: '2026-10-15T10:00:00.000Z',
  durationMs: 900,
  peakDb: -6,
  rmsDb: -20,
  leadMs: 100,
  tailMs: 100,
  ...over,
})

const milk = phrase('allergens', 'milk', 'name', 'Milk')
const bap = phrase('bread', 'bap', 'name', 'Bap')

describe('buildRows', () => {
  it('offers the generated clip first, then each contributor in name order', () => {
    const rows = buildRows([milk], [clip('sam-00ab12', 'allergens', 'milk_name.wav'), clip('amira-3f9a1c', 'allergens', 'milk_name.wav')])
    expect(rows[0].options.map((o) => [o.source, o.url])).toEqual([
      ['generated', '/content/allergens/audio/milk_name.mp3'],
      ['amira-3f9a1c', '/recordings/amira-3f9a1c/allergens/milk_name.wav'],
      ['sam-00ab12', '/recordings/sam-00ab12/allergens/milk_name.wav'],
    ])
    expect(rows[0].recorded).toBe(2)
  })

  it('keeps a phrase no one has recorded, with the generated clip alone', () => {
    const rows = buildRows([milk, bap], [clip('amira-3f9a1c', 'allergens', 'milk_name.wav')])
    expect(rows[1].recorded).toBe(0)
    expect(rows[1].options.map((o) => o.source)).toEqual(['generated'])
  })

  it('matches a clip to its own module, not just the filename', () => {
    const rows = buildRows([milk], [clip('amira-3f9a1c', 'bread', 'milk_name.wav')])
    expect(rows[0].recorded).toBe(0)
  })

  it('flags a recording worth a listen', () => {
    const rows = buildRows([milk], [
      clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { peakDb: -40 }),
      clip('sam-00ab12', 'allergens', 'milk_name.wav'),
    ])
    expect(rows[0].options[1].warnings).toEqual(['Quiet'])
    expect(rows[0].options[2].warnings).toEqual([])
  })
})

describe('filterRows', () => {
  const rows = buildRows([milk, bap], [clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { peakDb: -40 })])

  it('shows one module', () => {
    expect(filterRows(rows, { module: 'bread', show: 'all' }).map((r) => r.phrase.id)).toEqual(['bap'])
  })

  it('splits recorded from not recorded', () => {
    expect(filterRows(rows, { module: 'all', show: 'recorded' }).map((r) => r.phrase.id)).toEqual(['milk'])
    expect(filterRows(rows, { module: 'all', show: 'missing' }).map((r) => r.phrase.id)).toEqual(['bap'])
  })

  it('shows only the phrases with a warning', () => {
    expect(filterRows(rows, { module: 'all', show: 'problems' }).map((r) => r.phrase.id)).toEqual(['milk'])
  })
})

describe('voices', () => {
  it('counts each contributor’s clips and their middle level', () => {
    expect(
      voices([
        clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { peakDb: -3, rmsDb: -18 }),
        clip('amira-3f9a1c', 'bread', 'bap_name.wav', { peakDb: -9, rmsDb: -22 }),
        clip('amira-3f9a1c', 'bread', 'rye_name.wav', { peakDb: -6, rmsDb: -20 }),
        clip('sam-00ab12', 'bread', 'bap_name.wav', { peakDb: -24, rmsDb: -34 }),
      ]),
    ).toEqual([
      { contributor: 'amira-3f9a1c', clips: 3, medianPeakDb: -6, medianRmsDb: -20 },
      { contributor: 'sam-00ab12', clips: 1, medianPeakDb: -24, medianRmsDb: -34 },
    ])
  })
})

describe('median', () => {
  it('averages the middle two of an even number', () => {
    expect(median([-10, -20, -30, -40])).toBe(-25)
  })
})
