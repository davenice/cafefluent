import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { ModuleDef } from '../../types'
import MixedSummary, { type ModuleResult } from './MixedSummary'

const mod = (id: string, title: string): ModuleDef => ({
  id,
  title,
  description: `About ${title}`,
  dataUrl: `/content/${id}/data.json`,
  imageBase: `/content/${id}/images/`,
  tasks: [],
})

const result = (id: string, title: string, right: number, asked: number): ModuleResult =>
  ({ mod: mod(id, title), right, asked })

const show = (results: ModuleResult[]) =>
  render(<MemoryRouter><MixedSummary results={results} /></MemoryRouter>)

describe('MixedSummary', () => {
  it('shows how each module went', () => {
    show([result('bread', 'Bread', 3, 4), result('milk', 'Milk', 5, 5)])

    expect(screen.getByText('Bread')).toBeInTheDocument()
    expect(screen.getByText('3 / 4')).toBeInTheDocument()
    expect(screen.getByText('5 / 5')).toBeInTheDocument()
  })

  it('names the modules worth practising again, as links to them', () => {
    show([result('bread', 'Bread', 1, 4), result('milk', 'Milk', 5, 5)])

    const link = screen.getByRole('link', { name: /Bread/ })
    expect(link).toHaveAttribute('href', '/bread')
    expect(screen.queryByRole('link', { name: /Milk/ })).not.toBeInTheDocument()
  })

  it('puts the module that went worst first', () => {
    show([
      result('bread', 'Bread', 2, 4),
      result('milk', 'Milk', 0, 4),
      result('allergens', 'Allergens', 5, 5),
    ])

    const names = screen.getAllByRole('link').map((l) => l.textContent)
    expect(names).toEqual(['Milk →', 'Bread →'])
  })

  it('says so when nothing needs practising', () => {
    show([result('bread', 'Bread', 4, 4), result('milk', 'Milk', 4, 5)])

    expect(screen.getByText('You did well in every module.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('counts a module just under seven in ten as worth practising', () => {
    show([result('bread', 'Bread', 6, 10), result('milk', 'Milk', 7, 10)])

    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Bread →'])
  })

  it('lists the modules by name, whatever order they were asked in', () => {
    show([result('milk', 'Milk', 4, 4), result('allergens', 'Allergens', 4, 4)])

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['Allergens4 / 4', 'Milk4 / 4'])
  })
})
