import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import OrderMatch from './OrderMatch'
import type { AllergenItem, OrderItem } from '../../types'

vi.mock('../../utils/shuffle', () => ({
  shuffle: (arr: unknown[]) => [...arr],
  pickRandom: (arr: unknown[], n: number, exclude?: unknown) =>
    arr.filter((x) => x !== exclude).slice(0, n),
}))

// With identity shuffle, questions are in order and each question's options are:
// [the milk ordered, No milk, the first 2 other milks].
const items: AllergenItem[] = [
  { id: 'oat', name: 'Oat milk', description: '', image: 'oat.svg' },
  { id: 'almond', name: 'Almond milk', description: '', image: 'almond.svg' },
  { id: 'soya', name: 'Soya milk', description: '', image: 'soya.svg' },
  { id: 'whole', name: 'Whole milk', description: '', image: 'whole.svg' },
]

const noneOption = { id: 'none', name: 'No milk' }

const orders: OrderItem[] = [
  { id: 'soya-cappuccino', text: 'a soya cappuccino', item: 'soya' },
  { id: 'black-americano', text: 'a black americano', item: 'none' },
  { id: 'oat-cortado', text: 'an oat cortado', item: 'oat' },
]

const renderQuiz = (onComplete = vi.fn()) =>
  render(
    <OrderMatch
      orders={orders}
      items={items}
      noneOption={noneOption}
      audioBase="/audio/"
      onComplete={onComplete}
    />
  )

describe('OrderMatch', () => {
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

  it('plays the order, named by the order rather than the milk', () => {
    renderQuiz()
    act(() => { vi.advanceTimersByTime(300) })
    const audio = playSpy.mock.instances[0] as HTMLAudioElement
    expect(audio.src).toContain('/audio/soya-cappuccino_name.mp3')
  })

  it('offers the milk ordered and No milk among the choices', () => {
    renderQuiz()
    // The first button is the speaker, which has an icon and no text.
    expect(screen.getAllByRole('button').map((b) => b.textContent).slice(1)).toEqual([
      'Soya milk', 'No milk', 'Oat milk', 'Almond milk',
    ])
  })

  it('does not write the order out until it has been answered', () => {
    renderQuiz()
    expect(screen.queryByText('A soya cappuccino')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Soya milk' }))
    expect(screen.getByText('A soya cappuccino')).toBeInTheDocument()
  })

  it('counts No milk as the right answer for an order with none in it', () => {
    const onComplete = vi.fn()
    renderQuiz(onComplete)
    fireEvent.click(screen.getByRole('button', { name: 'Soya milk' }))
    act(() => { vi.advanceTimersByTime(1200) })
    fireEvent.click(screen.getByRole('button', { name: 'No milk' }))
    act(() => { vi.advanceTimersByTime(1200) })
    fireEvent.click(screen.getByRole('button', { name: 'Oat milk' }))
    act(() => { vi.advanceTimersByTime(1200) })
    expect(onComplete).toHaveBeenCalledWith(3, 3)
  })

  it('marks a milk chosen for an order with no milk in it wrong', () => {
    const onComplete = vi.fn()
    renderQuiz(onComplete)
    fireEvent.click(screen.getByRole('button', { name: 'Soya milk' }))
    act(() => { vi.advanceTimersByTime(1200) })
    fireEvent.click(screen.getByRole('button', { name: 'Oat milk' }))
    act(() => { vi.advanceTimersByTime(2500) })
    fireEvent.click(screen.getByRole('button', { name: 'Oat milk' }))
    act(() => { vi.advanceTimersByTime(1200) })
    expect(onComplete).toHaveBeenCalledWith(2, 3)
  })

  it('replays the order when the speaker is tapped', () => {
    renderQuiz()
    act(() => { vi.advanceTimersByTime(300) })
    fireEvent.click(screen.getByRole('button', { name: /Play audio|Playing…/ }))
    expect(playSpy).toHaveBeenCalledTimes(2)
  })
})
