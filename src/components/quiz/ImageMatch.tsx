import { useState, useEffect, useCallback } from 'react'
import type { AllergenItem } from '../../types'
import { buildImageQuestions } from './questionBuilders'

interface Props {
  items: AllergenItem[]
  imageBase: string
  onComplete: (score: number, total: number) => void
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

export default function ImageMatch({ items, imageBase, onComplete }: Props) {
  const [questions] = useState(() => buildImageQuestions(items))
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
    const delay = answerState === 'correct' ? 1200 : 2500
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

  function borderColor(option: AllergenItem): string {
    if (answerState === 'unanswered') return 'var(--color-border)'
    if (option.id === question.answer.id) return 'var(--color-correct)'
    if (option.id === selected) return 'var(--color-wrong)'
    return 'var(--color-border)'
  }

  function overlay(option: AllergenItem): React.ReactNode {
    if (answerState === 'unanswered') return null
    if (option.id === question.answer.id) {
      return (
        <span style={{ ...styles.overlay, background: 'rgba(45,106,79,0.5)' }}>✓</span>
      )
    }
    if (option.id === selected) {
      return (
        <span style={{ ...styles.overlay, background: 'rgba(193,18,31,0.75)' }}>✗</span>
      )
    }
    return null
  }

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>
        <p style={styles.promptName}>{question.answer.name}</p>
        <p style={styles.promptDesc}>{question.answer.description}</p>
      </div>

      <div style={styles.grid}>
        {question.options.map((option) => (
          <button
            key={option.id}
            style={{
              ...styles.optionBtn,
              borderColor: borderColor(option),
              opacity: answerState !== 'unanswered' && option.id !== question.answer.id && option.id !== selected ? 0.45 : 1,
            }}
            onClick={() => handleSelect(option.id)}
            disabled={answerState !== 'unanswered'}
          >
            <img
              src={`${imageBase}${option.image}`}
              alt={option.name}
              style={{ ...styles.optionImg, objectPosition: option.imagePosition ?? 'center' }}
            />
            {overlay(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    padding: '0 16px',
  },
  prompt: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '20px 16px',
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
  },
  promptName: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  promptDesc: {
    marginTop: 8,
    fontSize: 14,
    color: 'var(--color-muted)',
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  optionBtn: {
    position: 'relative',
    background: 'var(--color-surface)',
    border: '3px solid',
    borderRadius: 'var(--radius)',
    padding: 8,
    boxShadow: 'var(--shadow)',
    transition: 'border-color 0.2s, opacity 0.2s',
    aspectRatio: '1',
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
    color: '#fff',
    borderRadius: 'var(--radius-sm)',
    pointerEvents: 'none',
  },
  optionImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 'var(--radius-sm)',
    display: 'block',
  },
}
