import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ImageMatch from './ImageMatch'
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

describe('ImageMatch', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders the first question prompt', () => {
    render(<ImageMatch items={items} imageBase="/img/" onComplete={vi.fn()} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Desc of A')).toBeInTheDocument()
  })

  it('correct answer shows ✓ and advances after 1200ms', () => {
    render(<ImageMatch items={items} imageBase="/img/" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByAltText('Alpha').closest('button')!)
    expect(screen.getByText('✓')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1199) })
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByText('Desc of B')).toBeInTheDocument()
  })

  it('wrong answer shows ✗ and does not advance at 1200ms', () => {
    render(<ImageMatch items={items} imageBase="/img/" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByAltText('Beta').closest('button')!)
    expect(screen.getByText('✗')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.queryByText('Desc of B')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1300) })
    expect(screen.getByText('Desc of B')).toBeInTheDocument()
  })

  it('calls onComplete with correct score when all answers correct', () => {
    const onComplete = vi.fn()
    render(<ImageMatch items={items} imageBase="/img/" onComplete={onComplete} />)
    for (const item of items) {
      fireEvent.click(screen.getByAltText(item.name).closest('button')!)
      act(() => { vi.advanceTimersByTime(1200) })
    }
    expect(onComplete).toHaveBeenCalledWith(items.length, items.length)
  })

  it('wrong answers do not count toward score', () => {
    const onComplete = vi.fn()
    render(<ImageMatch items={items} imageBase="/img/" onComplete={onComplete} />)
    // Q1: answer wrong
    fireEvent.click(screen.getByAltText('Beta').closest('button')!)
    act(() => { vi.advanceTimersByTime(2500) })
    // Q2–Q5: answer correctly
    for (let i = 1; i < items.length; i++) {
      fireEvent.click(screen.getByAltText(items[i].name).closest('button')!)
      act(() => { vi.advanceTimersByTime(1200) })
    }
    expect(onComplete).toHaveBeenCalledWith(items.length - 1, items.length)
  })
})
