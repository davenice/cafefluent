import { render, screen, within, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ReviewPage from './ReviewPage'
import type { Phrase } from '../recorder/script'
import type { Clip } from '../review/clips'

// The real loadScript fetches every module's data.json; the phrase list itself
// is tested in src/recorder/script.test.ts.
const { loadScript } = vi.hoisted(() => ({ loadScript: vi.fn() }))
vi.mock('../recorder/script', async (original) => ({ ...(await original<object>()), loadScript }))

const phrases: Phrase[] = [
  { module: 'allergens', moduleTitle: 'Allergens', id: 'milk', variant: 'name', text: 'Milk', file: 'milk_name.wav' },
  { module: 'bread', moduleTitle: 'Bread', id: 'bap', variant: 'name', text: 'Bap', file: 'bap_name.wav' },
]

const clips: Clip[] = [
  {
    contributor: 'amira-3f9a1c', module: 'allergens', file: 'milk_name.wav',
    bytes: 40000, recorded: '2026-10-15T10:00:00.000Z',
    durationMs: 900, peakDb: -6, rmsDb: -20, leadMs: 100, tailMs: 100,
  },
]

let playSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  loadScript.mockResolvedValue(phrases)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clips }) }))
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
const sources = (text: string) => within(row(text)).getAllByText(/Generated voice|amira-3f9a1c/).map((e) => e.textContent)
const played = () => (playSpy.mock.instances as HTMLAudioElement[]).map((a) => new URL(a.src).pathname)

describe('ReviewPage', () => {
  it('lists the recorded phrases with the generated clip and every recording', async () => {
    render(<ReviewPage />)
    expect(await screen.findByText('Milk')).toBeInTheDocument()
    expect(sources('Milk')).toEqual(['Generated voice', 'amira-3f9a1c'])
    // 'Recorded' is the opening view, so Bap is not shown yet.
    expect(screen.queryByText('Bap')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 2 phrases have a recording/)).toBeInTheDocument()
    expect(screen.getByText(/0.9s · peak -6 dB · average -20 dB/)).toBeInTheDocument()
  })

  it('shows the phrases no one has recorded', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'missing' } })
    expect(screen.getByText('Bap')).toBeInTheDocument()
    expect(screen.getByText('No one has recorded this yet.')).toBeInTheDocument()
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()
  })

  it('shows one module at a time', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'bread' } })
    expect(screen.getByText('Bap')).toBeInTheDocument()
    expect(screen.queryByText('Milk')).not.toBeInTheDocument()
  })

  it('plays one option, and stops it when it is clicked again', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.click(screen.getByLabelText('Play amira-3f9a1c'))
    expect(played()).toEqual(['/recordings/amira-3f9a1c/allergens/milk_name.wav'])

    const stop = screen.getByLabelText('Stop amira-3f9a1c')
    fireEvent.click(stop)
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
      '/recordings/amira-3f9a1c/allergens/milk_name.wav',
    ])

    fireEvent(playSpy.mock.instances[1] as HTMLAudioElement, new Event('ended'))
    expect(screen.getByLabelText('Play every version of Milk')).toBeInTheDocument()
  })

  it('stops what is playing when another phrase is started', async () => {
    render(<ReviewPage />)
    await screen.findByText('Milk')
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'all' } })

    fireEvent.click(within(row('Milk')).getByLabelText('Play Generated voice'))
    fireEvent.click(within(row('Bap')).getByLabelText('Play Generated voice'))
    expect(played()).toEqual(['/content/allergens/audio/milk_name.mp3', '/content/bread/audio/bap_name.mp3'])
    // Only the second one is still going.
    expect(screen.getAllByLabelText('Stop Generated voice')).toHaveLength(1)
    expect(within(row('Bap')).getByLabelText('Stop Generated voice')).toBeInTheDocument()
  })

  it('says so when the clips cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    render(<ReviewPage />)
    await waitFor(() => expect(screen.getByText(/Could not load the clips/)).toBeInTheDocument())
    expect(screen.getByText(/only works under/)).toBeInTheDocument()
  })
})
