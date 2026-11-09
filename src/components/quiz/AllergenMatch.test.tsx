import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import AllergenMatch from './AllergenMatch'
import type { AllergenItem } from '../../types'

vi.mock('../../utils/shuffle', () => ({
  shuffle: (arr: unknown[]) => [...arr],
  pickRandom: (arr: unknown[], n: number, exclude?: unknown) =>
    arr.filter((x) => x !== exclude).slice(0, n),
}))

// With identity shuffle, questions are in input order and each question's
// options are: [the item's allergen, the first 3 other allergens named].
const items: AllergenItem[] = [
  { id: 'oat', name: 'Oat milk', description: 'From oats.', image: 'oat.svg', allergen: 'Cereals containing gluten' },
  { id: 'almond', name: 'Almond milk', description: 'From almonds.', image: 'almond.svg', allergen: 'Tree nuts' },
  { id: 'soya', name: 'Soya milk', description: 'From soya beans.', image: 'soya.svg', allergen: 'Soya' },
  { id: 'coconut', name: 'Coconut milk', description: 'From coconut.', image: 'coconut.svg', allergen: 'No allergens' },
  { id: 'whole', name: 'Whole milk', description: "Cow's milk.", image: 'whole.svg', allergen: 'Milk (dairy)' },
]

const renderQuiz = (onComplete = vi.fn()) =>
  render(<AllergenMatch items={items} imageBase="/images/" imageFit="contain" onComplete={onComplete} />)

describe('AllergenMatch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the milk by name and picture, and offers allergens to choose from', () => {
    const { container } = renderQuiz()
    expect(screen.getByText('Oat milk')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/oat.svg')
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Cereals containing gluten', 'Tree nuts', 'Soya', 'No allergens',
    ])
  })

  it('shows the picture of the milk being asked about', () => {
    const { container } = renderQuiz()
    fireEvent.click(screen.getByRole('button', { name: 'Cereals containing gluten' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/almond.svg')
  })

  it('advances to the next milk after a correct answer', () => {
    renderQuiz()
    fireEvent.click(screen.getByRole('button', { name: 'Cereals containing gluten' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Almond milk')).toBeInTheDocument()
  })

  it('lingers longer on a wrong answer before advancing', () => {
    renderQuiz()
    fireEvent.click(screen.getByRole('button', { name: 'Tree nuts' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Oat milk')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByText('Almond milk')).toBeInTheDocument()
  })

  it('reports the score once every milk has been asked', () => {
    const onComplete = vi.fn()
    renderQuiz(onComplete)
    for (const allergen of ['Cereals containing gluten', 'Tree nuts', 'Soya', 'No allergens', 'Milk (dairy)']) {
      fireEvent.click(screen.getByRole('button', { name: allergen }))
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onComplete).toHaveBeenCalledWith(5, 5)
  })

  it('ignores further clicks once a question is answered', () => {
    const onComplete = vi.fn()
    renderQuiz(onComplete)
    fireEvent.click(screen.getByRole('button', { name: 'Tree nuts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cereals containing gluten' }))
    act(() => { vi.advanceTimersByTime(2200) })
    for (const allergen of ['Tree nuts', 'Soya', 'No allergens', 'Milk (dairy)']) {
      fireEvent.click(screen.getByRole('button', { name: allergen }))
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onComplete).toHaveBeenCalledWith(4, 5)
  })
})
