import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import SequenceOrder from './SequenceOrder'
import type { SequenceData } from '../../types'

// A reversed "shuffle" is deterministic and has no correct adjacencies, so
// shuffleSteps accepts it first time.
vi.mock('../../utils/shuffle', () => ({
  shuffle: (arr: unknown[]) => [...arr].reverse(),
}))

const sequence: SequenceData = {
  id: 'test',
  title: 'Test',
  steps: [
    { id: 'a', text: 'First step' },
    { id: 'b', text: 'Second step' },
    { id: 'c', text: 'Third step' },
  ],
}

function positionOf(text: string): string | null {
  return screen.getByText(text).parentElement!.getAttribute('data-position')
}

describe('SequenceOrder', () => {
  it('shows every step, shuffled, with a check button', () => {
    render(<SequenceOrder sequence={sequence} onComplete={vi.fn()} />)
    expect(positionOf('First step')).toBe('3')
    expect(positionOf('Second step')).toBe('2')
    expect(positionOf('Third step')).toBe('1')
    expect(screen.getByRole('button', { name: 'Check my order' })).toBeInTheDocument()
  })

  it('moves a card with the arrow keys on its handle', () => {
    render(<SequenceOrder sequence={sequence} onComplete={vi.fn()} />)
    const handle = screen.getByRole('button', { name: 'Drag to reorder: First step' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(positionOf('First step')).toBe('2')
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(positionOf('First step')).toBe('1')
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(positionOf('First step')).toBe('1')
  })

  it('moves a card by dragging its handle', () => {
    render(<SequenceOrder sequence={sequence} onComplete={vi.fn()} />)
    // jsdom reports the list at y=0; slots are 64px apart.
    const handle = screen.getByRole('button', { name: 'Drag to reorder: Third step' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 20 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 20 + 128 })
    expect(positionOf('Third step')).toBe('3')
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(positionOf('Third step')).toBe('3')
    expect(positionOf('Second step')).toBe('1')
    expect(positionOf('First step')).toBe('2')
  })

  it('shows up/down buttons on a tapped card', () => {
    render(<SequenceOrder sequence={sequence} onComplete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Second step'))
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }))
    expect(positionOf('Second step')).toBe('1')
  })

  it('scores by adjacency and reveals the right order on check', () => {
    const onComplete = vi.fn()
    render(<SequenceOrder sequence={sequence} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check my order' }))
    expect(screen.getByText('0 of 3 in the right order')).toBeInTheDocument()
    expect(screen.getByText('The right order')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Drag to reorder/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledWith(0, 3)
  })

  it('gives full marks for the correct order', () => {
    const onComplete = vi.fn()
    render(<SequenceOrder sequence={sequence} onComplete={onComplete} />)
    const first = screen.getByRole('button', { name: 'Drag to reorder: First step' })
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    const third = screen.getByRole('button', { name: 'Drag to reorder: Third step' })
    fireEvent.keyDown(third, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('button', { name: 'Check my order' }))
    expect(screen.getByText('3 of 3 in the right order')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledWith(3, 3)
  })
})
