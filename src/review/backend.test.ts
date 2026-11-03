import { describe, it, expect, vi } from 'vitest'
import { bundleBackend, localStore, pickBackend, type BundleData, type Store } from './backend'
import { serialiseDecisions } from './decisions'
import type { Phrase } from '../recorder/script'

const phrase: Phrase = {
  module: 'allergens',
  moduleTitle: 'Allergens',
  id: 'milk',
  variant: 'name',
  text: 'Milk',
  file: 'milk_name.wav',
}

const data = (over: Partial<BundleData> = {}): BundleData => ({
  made: '2026-11-03T00:00:00.000Z',
  phrases: [phrase],
  clips: [],
  prepared: { at: '2026-11-02T00:00:00.000Z' },
  decisions: { version: 1, hiddenVoices: [], phrases: {} },
  ...over,
})

/** A store that remembers, so a reload can be tested. */
function fakeStore(initial: Record<string, string> = {}): Store & { held: Record<string, string> } {
  const held = { ...initial }
  return {
    held,
    get: (key) => held[key] ?? null,
    set: (key, value) => void (held[key] = value),
  }
}

describe('bundleBackend', () => {
  it('starts from the decisions the bundle was sent with', async () => {
    const backend = bundleBackend(
      data({ decisions: { version: 1, hiddenVoices: ['beef12'], phrases: { 'allergens/milk_name.wav': { pick: '00ab12' } } } }),
      fakeStore(),
    )

    const loaded = await backend.load()

    expect(loaded.decisions.hiddenVoices).toEqual(['beef12'])
    expect(loaded.decisions.phrases['allergens/milk_name.wav'].pick).toBe('00ab12')
  })

  it('never offers the untrimmed takes, which the bundle does not carry', async () => {
    expect((await bundleBackend(data(), fakeStore()).load()).originals).toBe(false)
  })

  it('keeps a decision and hands back the decisions as they stand', async () => {
    const backend = bundleBackend(data(), fakeStore())

    const after = await backend.save({ type: 'pick', phrase: 'allergens/milk_name.wav', source: '00ab12' })

    expect(after.phrases['allergens/milk_name.wav'].pick).toBe('00ab12')
    expect((await backend.load()).decisions.phrases['allergens/milk_name.wav'].pick).toBe('00ab12')
  })

  it('finds what this browser already decided about this bundle', async () => {
    const store = fakeStore()
    await bundleBackend(data(), store).save({ type: 'pick', phrase: 'allergens/milk_name.wav', source: '00ab12' })

    // The page opened again, same bundle, same browser.
    const reopened = await bundleBackend(data(), store).load()

    expect(reopened.decisions.phrases['allergens/milk_name.wav'].pick).toBe('00ab12')
  })

  it('keeps each bundle\'s work apart, so an older copy still has its own', async () => {
    const store = fakeStore()
    await bundleBackend(data(), store).save({ type: 'pick', phrase: 'allergens/milk_name.wav', source: '00ab12' })

    const newer = await bundleBackend(data({ made: '2026-12-01T00:00:00.000Z' }), store).load()

    expect(newer.decisions.phrases).toEqual({})
    expect((await bundleBackend(data(), store).load()).decisions.phrases['allergens/milk_name.wav'].pick).toBe('00ab12')
  })

  it('starts from the bundle when the stored decisions are unreadable', async () => {
    const store = fakeStore({ 'cafefluent.audio-review.2026-11-03T00:00:00.000Z': 'not json' })

    const loaded = await bundleBackend(data({ decisions: { version: 1, hiddenVoices: ['beef12'], phrases: {} } }), store).load()

    expect(loaded.decisions.hiddenVoices).toEqual(['beef12'])
  })

  it('downloads the decisions as the file the project reads back', async () => {
    const backend = bundleBackend(data(), fakeStore())
    const decisions = await backend.save({ type: 'pick', phrase: 'allergens/milk_name.wav', source: '00ab12' })
    const click = vi.fn()
    const created: string[] = []
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      set href(v: string) {
        created.push(v)
      },
      download: '',
      click,
    } as unknown as HTMLAnchorElement)
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return 'blob:x'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const message = await backend.exportPicks([], decisions)

    expect(click).toHaveBeenCalled()
    expect(message).toContain('audio-review.json')
    expect(await blobs[0].text()).toBe(serialiseDecisions(decisions))
    vi.restoreAllMocks()
  })
})

describe('localStore', () => {
  it('reads nothing and writes nothing rather than throwing', () => {
    // What a private window, blocked site data, or file:// in some browsers does.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    const store = localStore()

    expect(store.get('k')).toBeNull()
    expect(() => store.set('k', 'v')).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('a review carries on with no storage behind it', async () => {
    const backend = bundleBackend(data(), { get: () => null, set: () => {} })

    const after = await backend.save({ type: 'pick', phrase: 'allergens/milk_name.wav', source: '00ab12' })

    expect(after.phrases['allergens/milk_name.wav'].pick).toBe('00ab12')
  })
})

describe('pickBackend', () => {
  it('uses the bundle when the page was built into one', () => {
    vi.stubGlobal('__REVIEW__', data())

    expect(pickBackend().kind).toBe('bundle')
    vi.unstubAllGlobals()
  })

  it('falls back to the dev server', () => {
    expect(pickBackend().kind).toBe('dev')
  })
})
