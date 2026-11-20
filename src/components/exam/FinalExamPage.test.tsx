import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import FinalExamPage from './FinalExamPage'
import { MODULES } from '../../data/modules'
import { FINAL_EXAM } from '../../data/finalExam'
import { referencedModules } from '../../exam/content'
import type { AllergenItem, ModuleData, OrderItem, ProductItem } from '../../types'

const KEY = 'cafefluent/final-exam'

/** Whatever the page has saved, or null. */
function saved(): { name: string; answers: Record<string, string> } | null {
  const raw = localStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : null
}

const answerCount = () => Object.values(saved()?.answers ?? {}).filter((a) => a.trim()).length

/**
 * Just enough module data to answer every reference the paper makes, built from
 * the paper itself so it keeps up with it. Whether the real content still has
 * these items is `scripts/content.test.ts`'s job, not this one's.
 */
function fakeData(moduleId: string): ModuleData {
  const items = new Map<string, AllergenItem>()
  const products = new Map<string, ProductItem>()
  const orders = new Map<string, OrderItem>()

  for (const q of FINAL_EXAM.questions) {
    if (!('module' in q.show) || q.show.module !== moduleId) continue
    switch (q.show.kind) {
      case 'item-image':
      case 'item-audio':
        items.set(q.show.item, {
          id: q.show.item,
          name: q.show.item,
          description: '',
          image: `${q.show.item}.jpg`,
        })
        break
      case 'product-image':
        products.set(q.show.product, {
          id: q.show.product,
          name: q.show.product,
          image: `${q.show.product}.jpg`,
          breadAnswer: '',
          breadIds: [],
        })
        break
      case 'order-audio':
        orders.set(q.show.order, { id: q.show.order, text: '', item: 'none' })
        break
    }
  }
  return {
    id: moduleId,
    title: moduleId,
    items: [...items.values()],
    products: [...products.values()],
    orders: [...orders.values()],
  }
}

// Node's own localStorage shadows jsdom's and is unusable without a file, so use a simple one.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const mod = MODULES.find((m) => m.dataUrl === url)
      if (!mod) return Promise.resolve({ ok: false, status: 404 } as Response)
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(fakeData(mod.id)) } as Response)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Render, and get past the start screen with a name typed in. */
async function start(name = 'Fatima') {
  render(<FinalExamPage />, { wrapper: MemoryRouter })
  const field = await screen.findByLabelText('Your name')
  fireEvent.change(field, { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: /Start the exam|Carry on/ }))
  await screen.findByText(/Question 1 of/)
}

describe('FinalExamPage', () => {
  it('fetches only the modules its questions point at', async () => {
    await start()
    const asked = vi.mocked(fetch).mock.calls.map((c) => c[0])
    expect(new Set(asked).size).toBe(referencedModules(FINAL_EXAM.questions).length)
  })

  it('keeps an answer when the learner goes back to it', async () => {
    await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ciabatta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText(/Question 2 of/)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText(/Question 1 of/)
    expect(screen.getByRole('textbox')).toHaveValue('ciabatta')
  })

  it('is ready to type in, on every question, without tapping the box first', async () => {
    await start()
    expect(screen.getByRole('textbox')).toHaveFocus()

    // Tapping a button moves the focus to it, as a real browser does; jsdom
    // does not do that on its own, and without it this test would pass on a
    // box that simply never lost the focus it got on the first question.
    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    fireEvent.click(next)

    await screen.findByText(/Question 2 of/)
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  // Two siblings sharing a key stops React reconciling them, and it inserts
  // copies rather than updating: the play button multiplied on every keystroke.
  it('keeps one play button on a listening question, however much is typed', async () => {
    await start()
    // q11 is the first question with a sound.
    for (let i = 1; i < 11; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/Question 11 of/)).toBeInTheDocument()

    const plays = () => screen.getAllByRole('button', { name: /Play the sound|Playing/ }).length
    expect(plays()).toBe(1)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'm' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mo' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mol' } })

    expect(plays()).toBe(1)
  })

  it('moves on when Enter is pressed in a one-line answer', async () => {
    await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ciabatta' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(await screen.findByText(/Question 2 of/)).toBeInTheDocument()
  })

  // Enter is how you start a new line there, so taking it would make the
  // taller boxes impossible to use for the lists and sentences they are for.
  it('does not move on when Enter is pressed in a box meant for more than a line', async () => {
    await start()
    // q8 is the first with a taller box: "What goes in a cappuccino?"
    for (let i = 1; i < 8; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/Question 8 of/)).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(screen.getByText(/Question 8 of/)).toBeInTheDocument()
  })

  // Enter commits a candidate in Chinese, Japanese and Korean keyboards, so
  // moving on then would throw away the word being typed.
  it('does not move on while the keyboard is still composing a word', async () => {
    await start()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true })

    expect(screen.getByText(/Question 1 of/)).toBeInTheDocument()
  })

  // The exam is half an hour of typing on a phone. The debounced save only
  // fires once typing stops, so without this the answers written in the last
  // few seconds before a call, an app switch, or iOS reclaiming a backgrounded
  // PWA would simply be gone.
  it('saves what has been typed the moment the page is hidden, without waiting', async () => {
    await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ciabatta' } })
    expect(saved()).toBeNull() // the debounce has not fired yet

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(answerCount()).toBe(1)
    expect(saved()?.name).toBe('Fatima')
  })

  it('saves when the app goes to the background', async () => {
    await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ciabatta' } })

    act(() => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(answerCount()).toBe(1)
  })

  it('offers the answers back after the page is opened again', async () => {
    await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ciabatta' } })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    render(<FinalExamPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('We kept your answers from last time.')).toBeInTheDocument()
    const fields = await screen.findAllByLabelText('Your name')
    expect(fields[fields.length - 1]).toHaveValue('Fatima')
  })

  it('will not start without a name, since it is the only thing naming the learner', async () => {
    render(<FinalExamPage />, { wrapper: MemoryRouter })
    expect(await screen.findByRole('button', { name: 'Start the exam' })).toBeDisabled()
  })

  it('says the exam cannot be opened rather than starting one that breaks part way', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)))
    render(<FinalExamPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('The exam cannot be opened.')).toBeInTheDocument()
  })

  it('builds the message from the answers, one numbered line each', async () => {
    await start()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ciabatta' } })
    fireEvent.click(screen.getByRole('button', { name: 'See all my answers' }))
    fireEvent.click(await screen.findByRole('button', { name: 'I’ve finished answering' }))

    const box = (await screen.findByLabelText('Your answers')) as HTMLTextAreaElement
    expect(box.value).toContain('1 ciabatta')
    expect(box.value).toContain('Fatima')
    // Every question has a line, answered or not.
    expect(box.value.split('\n')).toHaveLength(4 + FINAL_EXAM.questions.length)
    // The ones left empty are marked, not missing.
    expect(box.value).toContain('20 -')
  })
})
