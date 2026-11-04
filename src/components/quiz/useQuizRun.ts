import { useState, useEffect, useCallback } from 'react'

export type AnswerState = 'unanswered' | 'correct' | 'wrong'

/** How long the answer is shown before the next question, in milliseconds. */
export interface RunDelays {
  correct: number
  wrong: number
}

const DEFAULT_DELAYS: RunDelays = { correct: 1200, wrong: 2500 }

/**
 * What a question renderer needs to show an answer and report the next one.
 * `onAnswer` takes the key the learner tapped and whether it was right: the
 * renderer knows its own question, so only it can say.
 */
export interface AnswerProps {
  selected: string | null
  answerState: AnswerState
  onAnswer: (key: string, correct: boolean) => void
}

export interface QuizRun<Q> extends AnswerProps {
  question: Q
  index: number
  total: number
}

/**
 * One run through a list of questions: which one is showing, what was tapped,
 * the score, and moving on after the answer has been seen.
 *
 * The questions come from outside, so the same run drives a single module's
 * quiz and a mixed quiz drawing questions from several modules.
 */
export function useQuizRun<Q>(
  questions: Q[],
  onComplete: (score: number, total: number) => void,
  delays: RunDelays = DEFAULT_DELAYS
): QuizRun<Q> {
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')

  const onAnswer = useCallback(
    (key: string, correct: boolean) => {
      if (answerState !== 'unanswered') return
      setSelected(key)
      setAnswerState(correct ? 'correct' : 'wrong')
      if (correct) setScore((s) => s + 1)
    },
    [answerState]
  )

  useEffect(() => {
    if (answerState === 'unanswered') return
    const delay = answerState === 'correct' ? delays.correct : delays.wrong
    const timer = setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex((i) => i + 1)
        setSelected(null)
        setAnswerState('unanswered')
      } else {
        onComplete(score, questions.length)
      }
    }, delay)
    return () => clearTimeout(timer)
    // The delays are depended on by value: a caller passing a fresh object each
    // render would otherwise restart the timer forever and never advance.
  }, [answerState, index, questions.length, score, onComplete, delays.correct, delays.wrong])

  return {
    question: questions[index],
    index,
    total: questions.length,
    selected,
    answerState,
    onAnswer,
  }
}
