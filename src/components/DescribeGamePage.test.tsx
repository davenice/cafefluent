import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DescribeGamePage from './DescribeGamePage'

vi.mock('../game/settings', () => ({
  useGameSettings: () => ({ words: ['kettle', 'whisk', 'tongs'], seconds: 30, turns: 2 }),
}))

// Node's own localStorage shadows jsdom's and is unusable without a file, so use a simple one.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('DescribeGamePage', () => {
  it('adds players and plays a turn, with undo', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><DescribeGamePage /></MemoryRouter>)

    expect(screen.getByText('2 turns. 30 seconds for each turn.')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Name'), 'Amira{Enter}')
    await user.type(screen.getByPlaceholderText('Name'), 'Ben{Enter}')
    await user.click(screen.getByRole('button', { name: 'Start the game' }))

    expect(screen.getByText('Amira')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.getByText('Guessed: 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect(screen.getByText('Guessed: 1')).toBeInTheDocument()

    // Saved after every tap, so a reload carries on
    const saved = JSON.parse(localStorage.getItem('cafefluent/describe-it/game')!)
    expect(saved.history[0].results).toHaveLength(1)
  })

  it('remembers the players for next time', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MemoryRouter><DescribeGamePage /></MemoryRouter>)
    await user.type(screen.getByPlaceholderText('Name'), 'Chen{Enter}')
    unmount()
    render(<MemoryRouter><DescribeGamePage /></MemoryRouter>)
    expect(screen.getByText('Chen')).toBeInTheDocument()
  })
})
