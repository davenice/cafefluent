import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizRun } from './useQuizRun'

const QUESTIONS = ['a', 'b', 'c']

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function run(onComplete = vi.fn(), questions = QUESTIONS) {
  const hook = renderHook(() => useQuizRun(questions, onComplete))
  return { ...hook, onComplete }
}

/** Answer the question showing, then wait out the pause that follows. */
function answer(result: { current: ReturnType<typeof useQuizRun<string>> }, correct: boolean) {
  act(() => result.current.onAnswer(correct ? 'right' : 'wrong', correct))
  act(() => void vi.advanceTimersByTime(2500))
}

describe('useQuizRun', () => {
  it('starts on the first question', () => {
    const { result } = run()
    expect(result.current.question).toBe('a')
    expect(result.current.index).toBe(0)
    expect(result.current.total).toBe(3)
    expect(result.current.answerState).toBe('unanswered')
  })

  it('shows the answer before moving on', () => {
    const { result } = run()
    act(() => result.current.onAnswer('right', true))
    expect(result.current.answerState).toBe('correct')
    expect(result.current.selected).toBe('right')
    expect(result.current.question).toBe('a')

    act(() => void vi.advanceTimersByTime(1200))
    expect(result.current.question).toBe('b')
    expect(result.current.answerState).toBe('unanswered')
    expect(result.current.selected).toBeNull()
  })

  it('leaves a wrong answer up for longer than a right one', () => {
    const { result } = run()
    act(() => result.current.onAnswer('wrong', false))
    act(() => void vi.advanceTimersByTime(1200))
    expect(result.current.question).toBe('a')
    act(() => void vi.advanceTimersByTime(1300))
    expect(result.current.question).toBe('b')
  })

  it('uses the delays it is given', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useQuizRun(QUESTIONS, onComplete, { correct: 500, wrong: 800 })
    )
    act(() => result.current.onAnswer('right', true))
    act(() => void vi.advanceTimersByTime(500))
    expect(result.current.question).toBe('b')
  })

  it('ignores a second tap on an answered question', () => {
    const { result } = run()
    act(() => result.current.onAnswer('right', true))
    act(() => result.current.onAnswer('other', false))
    expect(result.current.selected).toBe('right')
    expect(result.current.answerState).toBe('correct')
  })

  it('reports the score once every question is answered', () => {
    const { result, onComplete } = run()
    answer(result, true)
    answer(result, false)
    answer(result, true)
    expect(onComplete).toHaveBeenCalledWith(2, 3)
  })

  it('does not report a score early', () => {
    const { result, onComplete } = run()
    answer(result, true)
    answer(result, true)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
