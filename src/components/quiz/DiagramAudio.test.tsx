import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import DiagramAudio from './DiagramAudio'
import type { DiagramData } from '../../types'

vi.mock('../../utils/shuffle', () => ({
  shuffle: (arr: unknown[]) => [...arr],
  pickRandom: (arr: unknown[], n: number, exclude?: unknown) =>
    arr.filter((x) => x !== exclude).slice(0, n),
}))

// With identity shuffle, questions run through each diagram's hotspots in order.
const diagrams: DiagramData[] = [
  {
    id: 'machine',
    title: 'Espresso machine',
    image: 'machine.jpg',
    hotspots: [
      { id: 'group-head', label: 'group head', x: 40, y: 30 },
      { id: 'steam-wand', label: 'steam wand', x: 50, y: 45 },
    ],
  },
  {
    id: 'grinder',
    title: 'Coffee grinder',
    image: 'grinder.jpg',
    hotspots: [
      { id: 'hopper', label: 'hopper', x: 40, y: 10 },
    ],
  },
]

const hotspot = (id: string) => screen.getByTestId(`hotspot-${id}`)

describe('DiagramAudio', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom has no media playback; stub so new Audio(...).play() resolves.
    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup() // unmount while pause() is still stubbed
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the first diagram with one marker per hotspot', () => {
    render(<DiagramAudio diagrams={diagrams} imageBase="/img/" audioBase="/audio/" onComplete={vi.fn()} />)
    expect(screen.getByAltText('Espresso machine')).toHaveAttribute('src', '/img/machine.jpg')
    expect(hotspot('group-head')).toBeInTheDocument()
    expect(hotspot('steam-wand')).toBeInTheDocument()
    expect(screen.queryByTestId('hotspot-hopper')).not.toBeInTheDocument()
    expect(screen.getByText('Espresso machine — 1 / 3')).toBeInTheDocument()
  })

  it('auto-plays the clip for the current hotspot', () => {
    render(<DiagramAudio diagrams={diagrams} imageBase="/img/" audioBase="/audio/" onComplete={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(300) })
    expect(playSpy).toHaveBeenCalledTimes(1)
    const audio = playSpy.mock.instances[0] as HTMLAudioElement
    expect(audio.src).toContain('/audio/group-head_name.mp3')
  })

  it('does not reveal labels before answering', () => {
    render(<DiagramAudio diagrams={diagrams} imageBase="/img/" audioBase="/audio/" onComplete={vi.fn()} />)
    expect(screen.queryByText(/group head/)).not.toBeInTheDocument()
    expect(hotspot('group-head')).toHaveAttribute('aria-label', 'Part')
  })

  it('correct tap shows the name and advances after 1200ms', () => {
    render(<DiagramAudio diagrams={diagrams} imageBase="/img/" audioBase="/audio/" onComplete={vi.fn()} />)
    fireEvent.click(hotspot('group-head'))
    expect(screen.getByText('✓ group head')).toBeInTheDocument()
    expect(hotspot('steam-wand')).toBeDisabled()
    act(() => { vi.advanceTimersByTime(1199) })
    expect(screen.getByText('Espresso machine — 1 / 3')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByText('Espresso machine — 2 / 3')).toBeInTheDocument()
  })

  it('wrong tap names the right part and waits 2500ms', () => {
    render(<DiagramAudio diagrams={diagrams} imageBase="/img/" audioBase="/audio/" onComplete={vi.fn()} />)
    fireEvent.click(hotspot('steam-wand'))
    expect(screen.getByText('✗ It was the group head')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByText('Espresso machine — 1 / 3')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1300) })
    expect(screen.getByText('Espresso machine — 2 / 3')).toBeInTheDocument()
  })

  it('moves on to the next diagram and reports the score', () => {
    const onComplete = vi.fn()
    render(<DiagramAudio diagrams={diagrams} imageBase="/img/" audioBase="/audio/" onComplete={onComplete} />)
    fireEvent.click(hotspot('group-head'))
    act(() => { vi.advanceTimersByTime(1200) })
    fireEvent.click(hotspot('group-head')) // wrong: answer is steam wand
    act(() => { vi.advanceTimersByTime(2500) })
    expect(screen.getByAltText('Coffee grinder')).toBeInTheDocument()
    fireEvent.click(hotspot('hopper'))
    act(() => { vi.advanceTimersByTime(1200) })
    expect(onComplete).toHaveBeenCalledWith(2, 3)
  })
})
