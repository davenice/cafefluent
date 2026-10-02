import { buildScript, clipWarnings, speakerOrder } from './script'
import { encodeWav, peakDb } from './wav'

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

describe('clipWarnings', () => {
  const phrase = buildScript([{ id: 'm', title: 'M', data: { variants: ['name'], items: [{ id: 'a', name: 'Fish' }] } }])[0]

  it('passes a normal clip', () => {
    expect(clipWarnings(phrase, { durationMs: 1200, peakDb: -6 })).toEqual([])
  })

  it('flags long, quiet and distorted clips', () => {
    expect(clipWarnings(phrase, { durationMs: 5000, peakDb: -40 })).toEqual(['Long for the words', 'Quiet'])
    expect(clipWarnings(phrase, { durationMs: 1000, peakDb: 0 })).toEqual(['May be distorted'])
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
