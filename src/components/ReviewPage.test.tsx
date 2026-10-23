import { render, screen, within, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ReviewPage from './ReviewPage'
import type { Phrase } from '../recorder/script'
import type { Clip } from '../review/clips'
import { applyPatch, emptyDecisions, parsePatch, type Decisions } from '../review/decisions'

// The real loadScript fetches every module's data.json; the phrase list itself
// is tested in src/recorder/script.test.ts.
const { loadScript } = vi.hoisted(() => ({ loadScript: vi.fn() }))
vi.mock('../recorder/script', async (original) => ({ ...(await original<object>()), loadScript }))

const phrases: Phrase[] = [
  { module: 'allergens', moduleTitle: 'Allergens', id: 'milk', variant: 'name', text: 'Milk', file: 'milk_name.wav' },
  { module: 'bread', moduleTitle: 'Bread', id: 'bap', variant: 'name', text: 'Bap', file: 'bap_name.wav' },
]

const clip = (contributor: string, over: Partial<Clip> = {}): Clip => ({
  contributor,
  module: 'allergens',
  file: 'milk_name.wav',
  bytes: 40000,
  recorded: '2026-10-15T10:00:00.000Z',
  durationMs: 900,
  peakDb: -6,
  rmsDb: -20,
  leadMs: 100,
  tailMs: 100,
  prepared: { durationMs: 700, peakDb: -3, rmsDb: -18, leadMs: 120, tailMs: 120, gainDb: 4, cutLeadMs: 150, cutTailMs: 50 },
  ...over,
})

let playSpy: ReturnType<typeof vi.spyOn>
let decisions: Decisions
let clips: Clip[]
let exported: { picked: unknown[] } | null
/** Set to make the next save fail, the way a dev server that has stopped would. */
let saveFails: string | null

/**
 * Stands in for the review dev server (scripts/reviewRecordings.ts): the same
 * three endpoints, applying each change with the same applyPatch.
 */
function fakeServer(url: string, init?: RequestInit) {
  const json = (body: unknown, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => body })
  const sent = () => JSON.parse(String(init?.body))
  if (url === '/recordings-api/review.json') {
    return json({ clips, prepared: { at: '2026-10-22T08:00:00.000Z' }, decisions })
  }
  if (url === '/recordings-api/decisions') {
    if (saveFails) return json({ error: saveFails }, false, 500)
    const patch = parsePatch(sent())
    if (!patch) return json({ error: 'Not a change I know how to make' }, false, 400)
    decisions = applyPatch(decisions, patch)
    return json({ decisions })
  }
  if (url === '/recordings-api/export') {
    exported = sent()
    return json({ file: '/repo/recordings-prepared/picks.json', picked: exported!.picked.length })
  }
  throw new Error(`nothing serves ${url}`)
}

beforeEach(() => {
  loadScript.mockResolvedValue(phrases)
  decisions = emptyDecisions()
  clips = [clip('amira-3f9a1c')]
  exported = null
  saveFails = null
  vi.stubGlobal('fetch', vi.fn(fakeServer))
  // jsdom has no media playback.
  playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const row = (text: string) => screen.getByText(text).closest('li')!
const sources = (text: string) => within(row(text)).getAllByText(/Generated voice|amira-3f9a1c|sam-00ab12/).map((e) => e.textContent)
const played = () => (playSpy.mock.instances as HTMLAudioElement[]).map((a) => new URL(a.src).pathname)
const show = (value: string) => fireEvent.change(screen.getByLabelText('Show'), { target: { value } })

describe('ReviewPage', () => {
  it('lists the phrases still to pick, with the generated clip and every recording', async () => {
    render(<ReviewPage />)
    expect(await screen.findByText('Milk')).toBeInTheDocument()
    expect(sources('Milk')).toEqual(['Generated voice', 'amira-3f9a1c'])
    // 'Still to pick' is the opening view, so the unrecorded Bap is not shown.
    expect(screen.queryByText('Bap')).not.toBeInTheDocument()
    expect(screen.getByText(/0 of 1 recorded phrases picked/)).toBeInTheDocument()
  })

  it('shows the prepared clip’s measurements, and what preparing it did', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    expect(screen.getByText(/0.7s · peak -3 dB · average -18 dB/)).toBeInTheDocument()
    expect(screen.getByText(/Prepared: \+4 dB, 200ms of silence off/)).toBeInTheDocument()
  })

  it('says when the prepare step has not been run', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url === '/recordings-api/review.json'
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ clips: [clip('amira-3f9a1c', { prepared: undefined })], prepared: null, decisions }) })
      : fakeServer(url))))
    render(<ReviewPage />)
    await screen.findByText('Milk')
    expect(screen.getByText(/No prepared copies yet/)).toBeInTheDocument()
    expect(screen.getByText('Not prepared yet')).toBeInTheDocument()
    expect(screen.getByLabelText('Listen to')).toBeDisabled()
    // Nothing prepared to play, so it falls back to the clip as recorded.
    fireEvent.click(screen.getByLabelText('Play amira-3f9a1c'))
    expect(played()).toEqual(['/recordings/amira-3f9a1c/allergens/milk_name.wav'])
  })

  it('shows the phrases no one has recorded', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    show('missing')
    expect(screen.getByText('Bap')).toBeInTheDocument()
    expect(screen.getByText('No one has recorded this yet.')).toBeInTheDocument()
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()
  })

  it('shows one module at a time', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    show('all')
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'bread' } })
    expect(screen.getByText('Bap')).toBeInTheDocument()
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()
  })

  it('plays the prepared clip, or the recording it was made from', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Play amira-3f9a1c'))
    expect(played()).toEqual(['/prepared/amira-3f9a1c/allergens/milk_name.wav'])

    fireEvent.change(screen.getByLabelText('Listen to'), { target: { value: 'original' } })
    fireEvent.click(screen.getByLabelText('Play amira-3f9a1c'))
    expect(played()).toEqual([
      '/prepared/amira-3f9a1c/allergens/milk_name.wav',
      '/recordings/amira-3f9a1c/allergens/milk_name.wav',
    ])
  })

  it('stops a clip when it is clicked again', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Play amira-3f9a1c'))
    fireEvent.click(screen.getByLabelText('Stop amira-3f9a1c'))
    expect(screen.getByLabelText('Play amira-3f9a1c')).toBeInTheDocument()
  })

  it('plays every version of a phrase one after another', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Play every version of Milk'))
    expect(played()).toEqual(['/content/allergens/audio/milk_name.mp3'])

    // The next one starts when the first ends.
    fireEvent(playSpy.mock.instances[0] as HTMLAudioElement, new Event('ended'))
    expect(played()).toEqual([
      '/content/allergens/audio/milk_name.mp3',
      '/prepared/amira-3f9a1c/allergens/milk_name.wav',
    ])

    fireEvent(playSpy.mock.instances[1] as HTMLAudioElement, new Event('ended'))
    expect(screen.getByLabelText('Play every version of Milk')).toBeInTheDocument()
  })

  it('stops what is playing when another phrase is started', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    show('all')

    fireEvent.click(within(row('Milk')).getByLabelText('Play Generated voice'))
    fireEvent.click(within(row('Bap')).getByLabelText('Play Generated voice'))
    expect(played()).toEqual(['/content/allergens/audio/milk_name.mp3', '/content/bread/audio/bap_name.mp3'])
    // Only the second one is still going.
    expect(screen.getAllByLabelText('Stop Generated voice')).toHaveLength(1)
    expect(within(row('Bap')).getByLabelText('Stop Generated voice')).toBeInTheDocument()
  })

  it('picks a recording, saves it, and takes the phrase off the list to pick', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Pick amira-3f9a1c'))
    await waitFor(() => expect(decisions.phrases['allergens/milk_name.wav']).toMatchObject({ pick: 'amira-3f9a1c' }))
    expect(screen.getByText(/1 of 1 recorded phrases picked/)).toBeInTheDocument()
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()

    show('picked')
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(within(row('Milk')).getByText('Picked ✓')).toBeInTheDocument()
    expect(within(row('Milk')).getByText(/picked: amira-3f9a1c/)).toBeInTheDocument()
  })

  it('un-picks when the pick is clicked again', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Pick amira-3f9a1c'))
    await waitFor(() => expect(screen.queryByText('Milk')).not.toBeInTheDocument())

    show('picked')
    fireEvent.click(screen.getByLabelText('Pick amira-3f9a1c'))
    await waitFor(() => expect(decisions.phrases['allergens/milk_name.wav']).toBeUndefined())
  })

  it('marks a recording bad, keeps it in view, and leaves it out of Play all', async () => {
    clips = [clip('amira-3f9a1c'), clip('sam-00ab12')]
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Mark sam-00ab12 bad'))
    await waitFor(() => expect(decisions.phrases['allergens/milk_name.wav']).toMatchObject({ bad: ['sam-00ab12'] }))
    expect(screen.getByLabelText('Mark sam-00ab12 bad')).toHaveTextContent('Bad ✓')
    expect(screen.getByText(/1 marked bad/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Play every version of Milk'))
    fireEvent(playSpy.mock.instances[0] as HTMLAudioElement, new Event('ended'))
    expect(played()).toEqual([
      '/content/allergens/audio/milk_name.mp3',
      '/prepared/amira-3f9a1c/allergens/milk_name.wav',
    ])
  })

  it('still lets a bad recording be played on its own', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    // Its only recording is about to be marked bad, which takes the phrase off
    // the list of ones still to pick.
    show('all')
    fireEvent.click(screen.getByLabelText('Mark amira-3f9a1c bad'))
    await waitFor(() => expect(screen.getByLabelText('Mark amira-3f9a1c bad')).toHaveTextContent('Bad ✓'))
    fireEvent.click(screen.getByLabelText('Play amira-3f9a1c'))
    expect(played()).toEqual(['/prepared/amira-3f9a1c/allergens/milk_name.wav'])
  })

  it('hides a voice, and brings it back', async () => {
    clips = [clip('amira-3f9a1c'), clip('sam-00ab12')]
    render(<ReviewPage />)
    await screen.findByText('Milk')
    expect(sources('Milk')).toEqual(['Generated voice', 'amira-3f9a1c', 'sam-00ab12'])

    fireEvent.click(screen.getByLabelText('Hide sam-00ab12'))
    await waitFor(() => expect(decisions.hiddenVoices).toEqual(['sam-00ab12']))
    expect(sources('Milk')).toEqual(['Generated voice', 'amira-3f9a1c'])
    expect(within(row('Milk')).getByText(/1 hidden/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Hide sam-00ab12'))
    await waitFor(() => expect(decisions.hiddenVoices).toEqual([]))
    expect(sources('Milk')).toEqual(['Generated voice', 'amira-3f9a1c', 'sam-00ab12'])
  })

  it('exports the picks, saying where they went', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Pick amira-3f9a1c'))
    await waitFor(() => expect(screen.getByText(/1 of 1 recorded phrases picked/)).toBeInTheDocument())

    fireEvent.click(screen.getByText('Export picks'))
    await waitFor(() => expect(screen.getByText(/Wrote 1 picks to/)).toBeInTheDocument())
    expect(exported).toMatchObject({
      picked: [{ phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c', target: 'milk_name.mp3' }],
      unrecorded: ['bread/bap_name.wav'],
    })
  })

  it('warns when a decision could not be saved, and keeps it on screen to try again', async () => {
    saveFails = 'the dev server has stopped'
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Pick amira-3f9a1c'))

    await waitFor(() => expect(screen.getByText(/Not saved: the dev server has stopped/)).toBeInTheDocument())
    expect(decisions.phrases['allergens/milk_name.wav']).toBeUndefined()
    // The change is still in the page, so it can be sent again.
    show('picked')
    expect(within(row('Milk')).getByText('Picked ✓')).toBeInTheDocument()

    saveFails = null
    fireEvent.click(screen.getByLabelText('Pick amira-3f9a1c'))
    await waitFor(() => expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument())
  })

  it('says so when the clips cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    render(<ReviewPage />)
    await waitFor(() => expect(screen.getByText(/Could not load the clips/)).toBeInTheDocument())
    expect(screen.getByText(/only works under/)).toBeInTheDocument()
  })
})
