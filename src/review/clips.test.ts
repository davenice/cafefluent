import { buildExport, buildRows, filterRows, median, progress, voices, type Clip } from './clips'
import { applyPatch, emptyDecisions, type Decisions, type Patch } from './decisions'
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

const decided = (...patches: Patch[]): Decisions =>
  patches.reduce((state, patch) => applyPatch(state, patch, '2026-10-23T09:00:00.000Z'), emptyDecisions())

const none = emptyDecisions()

describe('buildRows', () => {
  it('offers the generated clip first, then each contributor in name order', () => {
    const rows = buildRows([milk], [clip('sam-00ab12', 'allergens', 'milk_name.wav'), clip('amira-3f9a1c', 'allergens', 'milk_name.wav')], none)
    expect(rows[0].options.map((o) => [o.source, o.url])).toEqual([
      ['generated', '/content/allergens/audio/milk_name.mp3'],
      ['amira-3f9a1c', '/recordings/amira-3f9a1c/allergens/milk_name.wav'],
      ['sam-00ab12', '/recordings/sam-00ab12/allergens/milk_name.wav'],
    ])
    expect(rows[0].recorded).toBe(2)
    expect(rows[0].undecided).toBe(true)
  })

  it('plays the prepared copy where there is one, and keeps the original to compare', () => {
    const prepared = { durationMs: 700, peakDb: -3, rmsDb: -18, leadMs: 120, tailMs: 120, gainDb: 6, cutLeadMs: 300, cutTailMs: 100 }
    const rows = buildRows([milk], [clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { prepared })], none)
    expect(rows[0].options[1].url).toBe('/prepared/amira-3f9a1c/allergens/milk_name.wav')
    expect(rows[0].options[1].originalUrl).toBe('/recordings/amira-3f9a1c/allergens/milk_name.wav')
  })

  it('keeps a phrase no one has recorded, with the generated clip alone', () => {
    const rows = buildRows([milk, bap], [clip('amira-3f9a1c', 'allergens', 'milk_name.wav')], none)
    expect(rows[1].recorded).toBe(0)
    expect(rows[1].options.map((o) => o.source)).toEqual(['generated'])
    expect(rows[1].undecided).toBe(false)
  })

  it('matches a clip to its own module, not just the filename', () => {
    const rows = buildRows([milk], [clip('amira-3f9a1c', 'bread', 'milk_name.wav')], none)
    expect(rows[0].recorded).toBe(0)
  })

  it('flags a recording worth a listen', () => {
    const rows = buildRows([milk], [
      clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { peakDb: -55 }),
      clip('sam-00ab12', 'allergens', 'milk_name.wav'),
    ], none)
    expect(rows[0].options[1].warnings).toEqual(['Microphone very quiet'])
    expect(rows[0].options[2].warnings).toEqual([])
  })

  it('judges the length on the prepared clip, which is the one with the silence off', () => {
    const long = { durationMs: 6000, peakDb: -6, rmsDb: -20, leadMs: 2500, tailMs: 2500 }
    const rows = buildRows([milk], [clip('amira-3f9a1c', 'allergens', 'milk_name.wav', long)], none)
    expect(rows[0].options[1].warnings).toEqual(['Long for the words'])

    const trimmed = { ...long, prepared: { ...long, durationMs: 900, gainDb: 0, cutLeadMs: 2400, cutTailMs: 2400 } }
    const after = buildRows([milk], [clip('amira-3f9a1c', 'allergens', 'milk_name.wav', trimmed)], none)
    expect(after[0].options[1].warnings).toEqual([])
  })

  it('marks the picked option, and the bad ones', () => {
    const rows = buildRows(
      [milk],
      [clip('amira-3f9a1c', 'allergens', 'milk_name.wav'), clip('sam-00ab12', 'allergens', 'milk_name.wav')],
      decided(
        { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
        { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12', bad: true },
      ),
    )
    expect(rows[0].options.map((o) => [o.source, o.picked, o.bad])).toEqual([
      ['generated', false, false],
      ['amira-3f9a1c', true, false],
      ['sam-00ab12', false, true],
    ])
    expect(rows[0].pick).toBe('amira-3f9a1c')
    expect(rows[0].undecided).toBe(false)
  })

  it('counts a phrase whose recordings are all bad as dealt with', () => {
    const rows = buildRows(
      [milk],
      [clip('amira-3f9a1c', 'allergens', 'milk_name.wav')],
      decided({ type: 'bad', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c', bad: true }),
    )
    expect(rows[0].undecided).toBe(false)
    expect(rows[0].pick).toBeUndefined()
  })

  it('leaves a hidden voice out of what the page shows, but not out of its own pick', () => {
    const rows = buildRows(
      [milk],
      [clip('amira-3f9a1c', 'allergens', 'milk_name.wav'), clip('sam-00ab12', 'allergens', 'milk_name.wav')],
      decided(
        { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12' },
        { type: 'hide', contributor: 'sam-00ab12', hidden: true },
      ),
    )
    expect(rows[0].visible.map((o) => o.source)).toEqual(['generated', 'amira-3f9a1c'])
    expect(rows[0].recorded).toBe(1)
    expect(rows[0].hidden).toBe(1)
    expect(rows[0].pick).toBe('sam-00ab12')
  })
})

describe('filterRows', () => {
  const clips = [clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { peakDb: -55 })]
  const rows = buildRows([milk, bap], clips, none)

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

  it('separates what is still to pick from what has been picked', () => {
    expect(filterRows(rows, { module: 'all', show: 'undecided' }).map((r) => r.phrase.id)).toEqual(['milk'])
    expect(filterRows(rows, { module: 'all', show: 'picked' })).toEqual([])

    const picked = buildRows([milk, bap], clips, decided({ type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' }))
    expect(filterRows(picked, { module: 'all', show: 'undecided' })).toEqual([])
    expect(filterRows(picked, { module: 'all', show: 'picked' }).map((r) => r.phrase.id)).toEqual(['milk'])
  })
})

describe('progress', () => {
  it('counts what has been decided and what is left', () => {
    const clips = [
      clip('amira-3f9a1c', 'allergens', 'milk_name.wav'),
      clip('sam-00ab12', 'allergens', 'milk_name.wav'),
      clip('amira-3f9a1c', 'bread', 'bap_name.wav'),
    ]
    expect(progress(buildRows([milk, bap], clips, none))).toEqual({ recorded: 2, picked: 0, undecided: 2, bad: 0 })

    const after = decided(
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12', bad: true },
    )
    expect(progress(buildRows([milk, bap], clips, after))).toEqual({ recorded: 2, picked: 1, undecided: 1, bad: 1 })
  })
})

describe('buildExport', () => {
  const clips = [
    clip('amira-3f9a1c', 'allergens', 'milk_name.wav'),
    clip('sam-00ab12', 'bread', 'bap_name.wav'),
  ]
  const egg = phrase('allergens', 'egg', 'name', 'Egg')

  it('lists a line per pick, with the file the app plays', () => {
    const rows = buildRows([milk, bap, egg], clips, decided(
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'bad', phrase: 'bread/bap_name.wav', source: 'sam-00ab12', bad: true },
    ))
    const set = buildExport(rows)
    expect(set.picked).toEqual([
      {
        phrase: 'allergens/milk_name.wav',
        module: 'allergens',
        item: 'milk',
        variant: 'name',
        text: 'Milk',
        target: 'milk_name.mp3',
        source: 'amira-3f9a1c',
        clip: 'amira-3f9a1c/allergens/milk_name.wav',
      },
    ])
    expect(set.allBad).toEqual(['bread/bap_name.wav'])
    expect(set.unrecorded).toEqual(['allergens/egg_name.wav'])
    expect(set.undecided).toEqual([])
  })

  it('records keeping the generated clip as a decision, with no recording to take', () => {
    const rows = buildRows([milk], clips, decided({ type: 'pick', phrase: 'allergens/milk_name.wav', source: 'generated' }))
    expect(rows[0].options[0].picked).toBe(true)
    const [picked] = buildExport(rows).picked
    expect(picked.source).toBe('generated')
    expect(picked.target).toBe('milk_name.mp3')
    expect(picked.clip).toBeUndefined()
  })

  it('keeps a pick made by a voice that is now hidden', () => {
    const rows = buildRows([milk], clips, decided(
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'hide', contributor: 'amira-3f9a1c', hidden: true },
    ))
    expect(buildExport(rows).picked.map((p) => p.source)).toEqual(['amira-3f9a1c'])
  })

  it('leaves the phrases still to listen to in their own list', () => {
    const set = buildExport(buildRows([milk, bap], clips, none))
    expect(set.picked).toEqual([])
    expect(set.undecided).toEqual(['allergens/milk_name.wav', 'bread/bap_name.wav'])
  })
})

describe('voices', () => {
  const clips = [
    clip('amira-3f9a1c', 'allergens', 'milk_name.wav', { peakDb: -3, rmsDb: -18 }),
    clip('amira-3f9a1c', 'bread', 'bap_name.wav', { peakDb: -9, rmsDb: -22 }),
    clip('amira-3f9a1c', 'bread', 'rye_name.wav', { peakDb: -6, rmsDb: -20 }),
    clip('sam-00ab12', 'bread', 'bap_name.wav', { peakDb: -24, rmsDb: -34 }),
  ]

  it('counts each contributor’s clips and their middle level', () => {
    expect(voices(clips, [], none)).toEqual([
      { contributor: 'amira-3f9a1c', clips: 3, medianPeakDb: -6, medianRmsDb: -20, picked: 0, bad: 0, hidden: false },
      { contributor: 'sam-00ab12', clips: 1, medianPeakDb: -24, medianRmsDb: -34, picked: 0, bad: 0, hidden: false },
    ])
  })

  it('says how each voice has fared, and which are hidden', () => {
    const decisions = decided(
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'bad', phrase: 'bread/bap_name.wav', source: 'sam-00ab12', bad: true },
      { type: 'hide', contributor: 'sam-00ab12', hidden: true },
    )
    const rows = buildRows([milk, bap], clips, decisions)
    // A hidden voice still shows in the list: it is how you bring it back.
    expect(voices(clips, rows, decisions).map((v) => [v.contributor, v.picked, v.bad, v.hidden])).toEqual([
      ['amira-3f9a1c', 1, 0, false],
      ['sam-00ab12', 0, 1, true],
    ])
  })
})

describe('median', () => {
  it('averages the middle two of an even number', () => {
    expect(median([-10, -20, -30, -40])).toBe(-25)
  })
})
