import {
  applyPatch,
  emptyDecisions,
  parseDecisions,
  parsePatch,
  renameVoices,
  serialiseDecisions,
  voiceAlias,
  voiceAliases,
  type Decisions,
} from './decisions'

const NOW = '2026-10-23T09:00:00.000Z'
const apply = (decisions: Decisions, ...patches: Parameters<typeof applyPatch>[1][]) =>
  patches.reduce((state, patch) => applyPatch(state, patch, NOW), decisions)

describe('applyPatch', () => {
  it('records the pick for a phrase', () => {
    const after = apply(emptyDecisions(), { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' })
    expect(after.phrases).toEqual({
      'allergens/milk_name.wav': { pick: 'amira-3f9a1c', updated: NOW },
    })
  })

  it('moves the pick to another voice', () => {
    const after = apply(
      emptyDecisions(),
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12' },
    )
    expect(after.phrases['allergens/milk_name.wav'].pick).toBe('sam-00ab12')
  })

  it('drops a phrase once there is nothing left to say about it', () => {
    const after = apply(
      emptyDecisions(),
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: null },
    )
    expect(after.phrases).toEqual({})
  })

  it('marks a recording bad and keeps them in order', () => {
    const after = apply(
      emptyDecisions(),
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12', bad: true },
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c', bad: true },
    )
    expect(after.phrases['allergens/milk_name.wav'].bad).toEqual(['amira-3f9a1c', 'sam-00ab12'])
  })

  it('unmarks a recording without touching the pick', () => {
    const after = apply(
      emptyDecisions(),
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12', bad: true },
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12', bad: false },
    )
    expect(after.phrases['allergens/milk_name.wav']).toEqual({ pick: 'amira-3f9a1c', updated: NOW })
  })

  it('takes the pick away when the picked recording is marked bad', () => {
    const after = apply(
      emptyDecisions(),
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c', bad: true },
    )
    expect(after.phrases['allergens/milk_name.wav']).toEqual({ bad: ['amira-3f9a1c'], updated: NOW })
  })

  it('clears the mark against a recording that is then picked', () => {
    const after = apply(
      emptyDecisions(),
      { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c', bad: true },
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
    )
    expect(after.phrases['allergens/milk_name.wav']).toEqual({ pick: 'amira-3f9a1c', updated: NOW })
  })

  it('hides and shows a voice, once each', () => {
    const hidden = apply(
      emptyDecisions(),
      { type: 'hide', contributor: 'sam-00ab12', hidden: true },
      { type: 'hide', contributor: 'sam-00ab12', hidden: true },
      { type: 'hide', contributor: 'amira-3f9a1c', hidden: true },
    )
    expect(hidden.hiddenVoices).toEqual(['amira-3f9a1c', 'sam-00ab12'])
    expect(apply(hidden, { type: 'hide', contributor: 'sam-00ab12', hidden: false }).hiddenVoices).toEqual(['amira-3f9a1c'])
  })

  it('leaves the decisions it was given alone', () => {
    const before = emptyDecisions()
    apply(before, { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' })
    expect(before.phrases).toEqual({})
  })
})

describe('parseDecisions', () => {
  it('keeps what makes sense and drops the rest', () => {
    expect(
      parseDecisions({
        hiddenVoices: ['sam-00ab12', 'sam-00ab12', 7],
        phrases: {
          'allergens/milk_name.wav': { pick: 'amira-3f9a1c', bad: ['sam-00ab12'], updated: NOW },
          'allergens/egg_name.wav': { pick: 12, bad: 'nonsense' },
          'bread/bap_name.wav': {},
        },
      }),
    ).toEqual({
      version: 1,
      hiddenVoices: ['sam-00ab12'],
      phrases: { 'allergens/milk_name.wav': { pick: 'amira-3f9a1c', bad: ['sam-00ab12'], updated: NOW } },
    })
  })

  it('reads an empty or missing file as nothing decided', () => {
    expect(parseDecisions(null)).toEqual(emptyDecisions())
    expect(parseDecisions({})).toEqual(emptyDecisions())
  })
})

describe('parsePatch', () => {
  it('takes the three changes the page makes', () => {
    expect(parsePatch({ type: 'pick', phrase: 'a/b.wav', source: 'sam' })).toEqual({ type: 'pick', phrase: 'a/b.wav', source: 'sam' })
    expect(parsePatch({ type: 'pick', phrase: 'a/b.wav', source: null })).toEqual({ type: 'pick', phrase: 'a/b.wav', source: null })
    expect(parsePatch({ type: 'bad', phrase: 'a/b.wav', source: 'sam', bad: true })).toEqual({ type: 'bad', phrase: 'a/b.wav', source: 'sam', bad: true })
    expect(parsePatch({ type: 'hide', contributor: 'sam', hidden: false })).toEqual({ type: 'hide', contributor: 'sam', hidden: false })
  })

  it('refuses anything else', () => {
    expect(parsePatch(null)).toBeNull()
    expect(parsePatch({ type: 'drop-everything', phrase: 'a/b.wav' })).toBeNull()
    expect(parsePatch({ type: 'pick', source: 'sam' })).toBeNull()
    expect(parsePatch({ type: 'pick', phrase: 'a/b.wav', source: 12 })).toBeNull()
    expect(parsePatch({ type: 'bad', phrase: 'a/b.wav', source: 'sam' })).toBeNull()
    expect(parsePatch({ type: 'hide', contributor: 'sam' })).toBeNull()
  })
})

describe('serialiseDecisions', () => {
  it('writes the phrases in order, so the file diffs cleanly', () => {
    const decisions = apply(
      emptyDecisions(),
      { type: 'pick', phrase: 'bread/bap_name.wav', source: 'sam-00ab12' },
      { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
    )
    const text = serialiseDecisions(decisions)
    expect(text.indexOf('allergens/milk_name.wav')).toBeLessThan(text.indexOf('bread/bap_name.wav'))
    expect(text.endsWith('\n')).toBe(true)
    expect(parseDecisions(JSON.parse(text))).toEqual(decisions)
  })
})

describe('voiceAlias', () => {
  it('keeps the six characters the recordings function adds, and drops the name', () => {
    expect(voiceAlias('amira-k-3f9a1c')).toBe('3f9a1c')
    expect(voiceAlias('ravi-patel-through-sam-d77e2b')).toBe('d77e2b')
    expect(voiceAlias('tryout2-6cae0f')).toBe('6cae0f')
  })

  it('leaves a folder that is not one of its ids alone', () => {
    expect(voiceAlias('someone')).toBe('someone')
    expect(voiceAlias('amira-k-3f9a1')).toBe('amira-k-3f9a1')
  })
})

describe('voiceAliases', () => {
  it('maps each contributor both ways', () => {
    const { expand, collapse } = voiceAliases(['amira-3f9a1c', 'sam-00ab12'])
    expect(expand).toEqual({ '3f9a1c': 'amira-3f9a1c', '00ab12': 'sam-00ab12' })
    expect(collapse).toEqual({ 'amira-3f9a1c': '3f9a1c', 'sam-00ab12': '00ab12' })
  })

  it('refuses to let two voices share one name in the file', () => {
    expect(() => voiceAliases(['amira-3f9a1c', 'sam-3f9a1c'])).toThrow(/Rename one of them/)
  })

  it('does not mind being given the same contributor twice', () => {
    expect(() => voiceAliases(['amira-3f9a1c', 'amira-3f9a1c'])).not.toThrow()
  })
})

describe('renameVoices', () => {
  const decisions = apply(
    emptyDecisions(),
    { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' },
    { type: 'bad', phrase: 'allergens/milk_name.wav', source: 'sam-00ab12', bad: true },
    { type: 'bad', phrase: 'bread/bap_name.wav', source: 'generated', bad: true },
    { type: 'hide', contributor: 'sam-00ab12', hidden: true },
  )
  const { collapse, expand } = voiceAliases(['amira-3f9a1c', 'sam-00ab12'])

  it('takes the names out, and puts them back', () => {
    const stored = renameVoices(decisions, collapse)
    expect(JSON.stringify(stored)).not.toMatch(/amira|sam/)
    expect(stored.phrases['allergens/milk_name.wav']).toEqual({ pick: '3f9a1c', bad: ['00ab12'], updated: NOW })
    expect(stored.hiddenVoices).toEqual(['00ab12'])
    expect(renameVoices(stored, expand)).toEqual(decisions)
  })

  it('leaves the generated clip and an unknown voice as they are', () => {
    const stored = renameVoices(decisions, collapse)
    expect(stored.phrases['bread/bap_name.wav'].bad).toEqual(['generated'])
    // A voice with no folder in recordings/ keeps whatever the file called it.
    const unknown = renameVoices(parseDecisions({ phrases: { 'bread/bap_name.wav': { bad: ['9c0de1'] } } }), expand)
    expect(unknown.phrases['bread/bap_name.wav'].bad).toEqual(['9c0de1'])
  })
})
