import { useState, useEffect, useCallback } from 'react'
import type { AllergenItem } from '../../types'
import { buildIngredientQuestions } from './questionBuilders'

interface Props {
  items: AllergenItem[]
  onComplete: (score: number, total: number) => void
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

export default function IngredientMatch({ items, onComplete }: Props) {
  const [questions] = useState(() => buildIngredientQuestions(items))
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')

  const question = questions[index]

  const handleSelect = useCallback(
    (itemId: string) => {
      if (answerState !== 'unanswered') return
      const correct = itemId === question.answer.id
      setSelected(itemId)
      setAnswerState(correct ? 'correct' : 'wrong')
      if (correct) setScore((s) => s + 1)
    },
    [answerState, question]
  )

  useEffect(() => {
    if (answerState === 'unanswered') return
    const delay = answerState === 'correct' ? 1000 : 2200
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
  }, [answerState, index, questions.length, score, onComplete])

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>
        <p style={styles.promptLabel}>What is in the cup?</p>
        <p style={styles.promptText}>{question.answer.description}</p>
        <div style={styles.badge}>
          {index + 1} of {questions.length}
        </div>
      </div>

      <div style={styles.options}>
        {question.options.map((option) => (
          <button
            key={option.id}
            style={optionStyle(option.id, question.answer.id, selected, answerState)}
            onClick={() => handleSelect(option.id)}
            disabled={answerState !== 'unanswered'}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function optionStyle(
  optionId: string,
  correctId: string,
  selected: string | null,
  answerState: AnswerState
): React.CSSProperties {
  let borderColor = 'var(--color-border)'
  let background = 'var(--color-surface)'
  let color = 'var(--color-text)'
  let opacity = 1

  if (answerState !== 'unanswered') {
    if (optionId === correctId) {
      borderColor = 'var(--color-correct)'
      background = '#d8f3dc'
      color = 'var(--color-correct)'
    } else if (optionId === selected) {
      borderColor = 'var(--color-wrong)'
      background = '#fde8e8'
      color = 'var(--color-wrong)'
    } else {
      opacity = 0.4
    }
  }

  return {
    width: '100%',
    background,
    border: '2px solid',
    borderColor,
    borderRadius: 'var(--radius)',
    padding: '14px 16px',
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'left',
    color,
    opacity,
    boxShadow: 'var(--shadow)',
    transition: 'border-color 0.2s, background 0.2s, opacity 0.2s, color 0.2s',
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: '0 16px',
  },
  prompt: {
    position: 'relative',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '22px 18px',
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
  },
  promptLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--color-muted)',
    marginBottom: 10,
  },
  promptText: {
    fontSize: 19,
    fontWeight: 500,
    lineHeight: 1.45,
    color: 'var(--color-text)',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 12,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-muted)',
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
}
