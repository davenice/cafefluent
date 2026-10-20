import { buildScript, clipWarnings, recordingOrder, speakerOrder } from './script'
import { applyGain, encodeWav, loudLevelDb, normaliseGainDb, peakDb, NORMALISE_TARGET_DB, MAX_GAIN_DB } from './wav'

describe('buildScript', () => {
  it('gives each item every sentence variant unless the module lists its own', () => {
    const phrases = buildScript([
      { id: 'allergens', title: 'Allergens', data: { items: [{ id: 'nuts', name: 'Tree nuts' }] } },
      { id: 'bread', title: 'Bread', data: { variants: ['name'], items: [{ id: 'bap', name: 'Bap', audioName: 'bap or roll' }] } },
    ])
    expect(phrases.map((p) => [p.file, p.text])).toEqual([
      ['nuts_name.wav', 'Tree nuts'],
      ['nuts_allergic.wav', "I'm allergic to tree nuts"],
      ['nuts_intolerant.wav', "I'm intolerant to tree nuts"],
      ['nuts_must-not-eat.wav', 'I must not eat tree nuts'],
      ['nuts_cant-eat.wav', "I can't eat tree nuts"],
      ['nuts_allergy-to.wav', 'I have an allergy to tree nuts'],
      ['nuts_cant-have.wav', "I can't have tree nuts"],
      ['bap_name.wav', 'Bap or roll'],
    ])
  })

  it('lets an item record only some of the variants', () => {
    const phrases = buildScript([
      { id: 'allergens', title: 'Allergens', data: { items: [{ id: 'milk', name: 'Milk', variants: ['name', 'allergic', 'cant-have'] }] } },
    ])
    expect(phrases.map((p) => p.text)).toEqual(['Milk', "I'm allergic to milk", "I can't have milk"])
  })

  it('records diagram hotspot labels by name only', () => {
    const phrases = buildScript([
      { id: 'coffee', title: 'Barista', data: { items: [], diagrams: [{ hotspots: [{ id: 'tare', label: 'tare button' }] }] } },
    ])
    expect(phrases).toMatchObject([{ module: 'coffee', file: 'tare_name.wav', text: 'Tare button' }])
  })
})

describe('speakerOrder', () => {
  it('asks for every phrase once', () => {
    expect([...speakerOrder(118, 'sam')].sort((a, b) => a - b)).toEqual(Array.from({ length: 118 }, (_, i) => i))
  })

  it('gives the same speaker the same order, and different speakers different ones', () => {
    expect(speakerOrder(118, 'sam')).toEqual(speakerOrder(118, 'sam'))
    expect(speakerOrder(118, 'sam')).not.toEqual(speakerOrder(118, 'alex'))
  })
})

describe('recordingOrder', () => {
  const phrases = buildScript([
    { id: 'bread', title: 'Bread', data: { variants: ['name'], items: 'abcdefgh'.split('').map((id) => ({ id, name: id })) } },
  ])
  const key = (i: number) => `bread/${phrases[i].file}`

  it('is the speaker’s shuffle when no one else has recorded anything', () => {
    expect(recordingOrder(phrases, 'sam')).toEqual(speakerOrder(phrases.length, 'sam'))
    expect(recordingOrder(phrases, 'sam', {})).toEqual(speakerOrder(phrases.length, 'sam'))
  })

  it('asks for what the fewest others have recorded first, keeping the shuffle within each count', () => {
    const counts = { [key(0)]: 2, [key(1)]: 1, [key(2)]: 1, [key(3)]: 3 }
    const order = recordingOrder(phrases, 'sam', counts)
    const shuffled = speakerOrder(phrases.length, 'sam')
    const inShuffle = (ids: number[]) => shuffled.filter((i) => ids.includes(i))

    expect(order).toEqual([...inShuffle([4, 5, 6, 7]), ...inShuffle([1, 2]), 0, 3])
  })

  it('gives two speakers the same priorities but different phrases within them', () => {
    const counts = { [key(0)]: 1, [key(1)]: 1 }
    const sam = recordingOrder(phrases, 'sam', counts)
    const alex = recordingOrder(phrases, 'alex', counts)
    expect(new Set(sam.slice(0, 6))).toEqual(new Set(alex.slice(0, 6)))
    expect(sam.slice(0, 6)).not.toEqual(alex.slice(0, 6))
  })
})

describe('clipWarnings', () => {
  const phrase = buildScript([{ id: 'm', title: 'M', data: { variants: ['name'], items: [{ id: 'a', name: 'Fish' }] } }])[0]

  it('passes a normal clip', () => {
    expect(clipWarnings(phrase, { durationMs: 1200, peakDb: -6 })).toEqual([])
  })

  it('flags long, quiet and distorted clips', () => {
    expect(clipWarnings(phrase, { durationMs: 5000, peakDb: -60 })).toEqual(['Long for the words', 'Microphone very quiet'])
    expect(clipWarnings(phrase, { durationMs: 1000, peakDb: 0 })).toEqual(['May be distorted'])
  })

  it('passes a quiet recording that normalising brings up to level', () => {
    expect(clipWarnings(phrase, { durationMs: 1200, peakDb: -40 })).toEqual([])
  })
})

describe('encodeWav', () => {
  it('writes a 16-bit mono header and the samples', () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1]), 48000))
    expect(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3))).toBe('RIFF')
    expect(wav.getUint32(24, true)).toBe(48000)
    expect(wav.getUint16(34, true)).toBe(16)
    expect(wav.byteLength).toBe(44 + 6)
    expect([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(48, true)]).toEqual([0, 32767, -32768])
  })

  it('measures the peak level', () => {
    expect(peakDb(new Float32Array([0.5, -1]))).toBeCloseTo(0)
  })
})

describe('normalising', () => {
  /** A second of a tone at `amplitude`, with `spikes` full-scale samples in it. */
  function clip(amplitude: number, spikes = 0): Float32Array {
    const samples = new Float32Array(22050)
    for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.sin((i * 2 * Math.PI * 220) / 22050)
    for (let i = 0; i < spikes; i++) samples[i * 100] = 1
    return samples
  }

  it('brings a quiet recording up to the target and a loud one down', () => {
    const quiet = clip(0.01)   // about -40 dBFS
    const loud = clip(0.9)
    expect(normaliseGainDb(quiet)).toBeGreaterThan(25)
    expect(normaliseGainDb(loud)).toBeLessThan(0)
    for (const samples of [quiet, loud]) {
      expect(loudLevelDb(applyGain(samples, normaliseGainDb(samples)))).toBeCloseTo(NORMALISE_TARGET_DB, 1)
    }
  })

  it('leaves headroom, so a normalised clip does not reach full scale', () => {
    const samples = applyGain(clip(0.01), normaliseGainDb(clip(0.01)))
    expect(peakDb(samples)).toBeLessThan(0)
  })

  it('sets the level by the speech, not by one transient', () => {
    // A quiet reading with a few clicks at full scale: peak normalising would
    // find nothing to do, and the words would stay quiet.
    const samples = clip(0.01, 5)
    expect(peakDb(samples)).toBeCloseTo(0)
    expect(normaliseGainDb(samples)).toBeGreaterThan(25)
  })

  it('caps the gain, so a clip of near-silence is not lifted into noise', () => {
    expect(normaliseGainDb(clip(1e-6))).toBe(MAX_GAIN_DB)
  })

  it('leaves an empty clip alone', () => {
    expect(normaliseGainDb(new Float32Array(0))).toBe(0)
    expect(applyGain(new Float32Array(0), 6)).toEqual(new Float32Array(0))
  })
})
