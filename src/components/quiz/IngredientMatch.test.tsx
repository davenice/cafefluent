import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import IngredientMatch from './IngredientMatch'
import type { AllergenItem } from '../../types'

vi.mock('../../utils/shuffle', () => ({
  shuffle: (arr: unknown[]) => [...arr],
  pickRandom: (arr: unknown[], n: number, exclude?: unknown) =>
    arr.filter((x) => x !== exclude).slice(0, n),
}))

// With identity shuffle, questions are in input order and each question's
// options are: [answer, first 3 items excluding answer].
const items: AllergenItem[] = [
  { id: 'latte', name: 'Latte', description: 'Espresso with lots of steamed milk.', image: 'latte.svg' },
  { id: 'cortado', name: 'Cortado', description: 'Espresso with an equal amount of milk.', image: 'cortado.svg' },
  { id: 'mocha', name: 'Mocha', description: 'Espresso with chocolate powder, then milk.', image: 'mocha.svg' },
  { id: 'americano', name: 'Americano', description: 'Espresso first, then hot water.', image: 'americano.svg' },
  { id: 'espresso', name: 'Espresso', description: 'Just espresso.', image: 'espresso.svg' },
]

describe('IngredientMatch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the ingredients, not the drink name, as the prompt', () => {
    render(<IngredientMatch items={items} onComplete={vi.fn()} />)
    expect(screen.getByText('Espresso with lots of steamed milk.')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('advances to the next question after a correct answer', () => {
    render(<IngredientMatch items={items} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Latte' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Espresso with an equal amount of milk.')).toBeInTheDocument()
  })

  it('lingers longer on a wrong answer before advancing', () => {
    render(<IngredientMatch items={items} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cortado' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Espresso with lots of steamed milk.')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByText('Espresso with an equal amount of milk.')).toBeInTheDocument()
  })

  it('reports the score once every question is answered', () => {
    const onComplete = vi.fn()
    render(<IngredientMatch items={items} onComplete={onComplete} />)
    for (const name of ['Latte', 'Cortado', 'Mocha', 'Americano', 'Espresso']) {
      fireEvent.click(screen.getByRole('button', { name }))
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onComplete).toHaveBeenCalledWith(5, 5)
  })

  it('ignores further clicks once a question is answered', () => {
    const onComplete = vi.fn()
    render(<IngredientMatch items={items} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cortado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Latte' }))
    act(() => { vi.advanceTimersByTime(2200) })
    for (const name of ['Cortado', 'Mocha', 'Americano', 'Espresso']) {
      fireEvent.click(screen.getByRole('button', { name }))
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onComplete).toHaveBeenCalledWith(4, 5)
  })
})
