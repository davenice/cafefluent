import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import AudioMatch from './AudioMatch'
import type { AllergenItem } from '../../types'

vi.mock('../../utils/shuffle', () => ({
  shuffle: (arr: unknown[]) => [...arr],
  pickRandom: (arr: unknown[], n: number, exclude?: unknown) =>
    arr.filter((x) => x !== exclude).slice(0, n),
}))

// With identity shuffle, questions are in input order and each question's
// options are: [answer, first 3 items excluding answer].
const items: AllergenItem[] = [
  { id: 'a', name: 'Alpha', description: 'Desc of A', image: 'a.jpg' },
  { id: 'b', name: 'Beta', description: 'Desc of B', image: 'b.jpg' },
  { id: 'c', name: 'Gamma', description: 'Desc of C', image: 'c.jpg' },
  { id: 'd', name: 'Delta', description: 'Desc of D', image: 'd.jpg' },
  { id: 'e', name: 'Epsilon', description: 'Desc of E', image: 'e.jpg' },
]

describe('AudioMatch', () => {
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

  it('plays the answer audio for the current question', () => {
    render(<AudioMatch items={items} audioBase="/audio/" onComplete={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(300) })
    const audio = playSpy.mock.instances[0] as HTMLAudioElement
    expect(audio.src).toContain('/audio/a_name.mp3')
  })

  describe('answering with words (default)', () => {
    it('renders the option names as text buttons and no images', () => {
      render(<AudioMatch items={items} audioBase="/audio/" onComplete={vi.fn()} />)
      expect(screen.getByText('Alpha').closest('button')).toBeInTheDocument()
      expect(screen.getByText('Beta').closest('button')).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('correct answer advances after 1200ms', () => {
      render(<AudioMatch items={items} audioBase="/audio/" onComplete={vi.fn()} />)
      fireEvent.click(screen.getByText('Alpha'))
      expect(screen.getByText('1 of 5')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1200) })
      expect(screen.getByText('2 of 5')).toBeInTheDocument()
    })
  })

  describe('answering with pictures', () => {
    function renderPictures(onComplete = vi.fn()) {
      return render(
        <AudioMatch
          items={items}
          audioBase="/audio/"
          imageBase="/img/"
          answerWith="pictures"
          onComplete={onComplete}
        />
      )
    }

    it('renders the options as picture buttons with no visible names', () => {
      renderPictures()
      const img = screen.getByAltText('Alpha')
      expect(img).toHaveAttribute('src', '/img/a.jpg')
      expect(img.closest('button')).toBeInTheDocument()
      expect(screen.getAllByRole('img')).toHaveLength(4)
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    })

    it('correct picture shows ✓ and advances after 1200ms', () => {
      renderPictures()
      fireEvent.click(screen.getByAltText('Alpha').closest('button')!)
      expect(screen.getByText('✓')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1199) })
      expect(screen.getByText('1 of 5')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByText('2 of 5')).toBeInTheDocument()
    })

    it('wrong picture shows ✗ and waits 2500ms before advancing', () => {
      renderPictures()
      fireEvent.click(screen.getByAltText('Beta').closest('button')!)
      expect(screen.getByText('✗')).toBeInTheDocument()
      expect(screen.getByText('✓')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1200) })
      expect(screen.getByText('1 of 5')).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1300) })
      expect(screen.getByText('2 of 5')).toBeInTheDocument()
    })

    it('reports the score on completion', () => {
      const onComplete = vi.fn()
      renderPictures(onComplete)
      // Q1 wrong, the rest right
      fireEvent.click(screen.getByAltText('Beta').closest('button')!)
      act(() => { vi.advanceTimersByTime(2500) })
      for (let i = 1; i < items.length; i++) {
        fireEvent.click(screen.getByAltText(items[i].name).closest('button')!)
        act(() => { vi.advanceTimersByTime(1200) })
      }
      expect(onComplete).toHaveBeenCalledWith(items.length - 1, items.length)
    })
  })
})
