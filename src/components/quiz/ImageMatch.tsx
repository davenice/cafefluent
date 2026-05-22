import { useState, useEffect, useCallback } from 'react'
import type { AllergenItem } from '../../types'
import { shuffle, pickRandom } from '../../utils/shuffle'

interface Props {
  items: AllergenItem[]
  imageBase: string
  onComplete: (score: number, total: number) => void
}

interface Question {
  answer: AllergenItem
  options: AllergenItem[]
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

function buildQuestions(items: AllergenItem[]): Question[] {
  return shuffle(items).map((answer) => ({
    answer,
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
  }))
}

export default function ImageMatch({ items, imageBase, onComplete }: Props) {
  const [questions] = useState<Question[]>(() => buildQuestions(items))
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
    const timer = setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex((i) => i + 1)
        setSelected(null)
        setAnswerState('unanswered')
      } else {
        onComplete(score + (answerState === 'correct' ? 1 : 0), questions.length)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [answerState, index, questions.length, score, onComplete])

  function borderColor(option: AllergenItem): string {
    if (answerState === 'unanswered') return 'var(--color-border)'
    if (option.id === question.answer.id) return 'var(--color-correct)'
    if (option.id === selected) return 'var(--color-wrong)'
    return 'var(--color-border)'
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
              opacity: answerState !== 'unanswered' && option.id !== question.answer.id && option.id !== selected ? 0.5 : 1,
            }}
            onClick={() => handleSelect(option.id)}
            disabled={answerState !== 'unanswered'}
          >
            <img
              src={`${imageBase}${option.image}`}
              alt={option.name}
              style={styles.optionImg}
            />
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
    background: 'var(--color-surface)',
    border: '3px solid',
    borderRadius: 'var(--radius)',
    padding: 8,
    boxShadow: 'var(--shadow)',
    transition: 'border-color 0.2s, opacity 0.2s',
    aspectRatio: '1',
    overflow: 'hidden',
  },
  optionImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 'var(--radius-sm)',
    display: 'block',
  },
}
