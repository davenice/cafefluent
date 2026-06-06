import { useState, useEffect, useCallback } from 'react'
import type { DiagramData } from '../../types'
import { buildDiagramQuestions } from './questionBuilders'

interface Props {
  diagrams: DiagramData[]
  imageBase: string
  onComplete: (score: number, total: number) => void
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

export default function DiagramLabel({ diagrams, imageBase, onComplete }: Props) {
  const [questions] = useState(() => buildDiagramQuestions(diagrams))
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')

  const question = questions[index]

  const handleSelect = useCallback(
    (label: string) => {
      if (answerState !== 'unanswered') return
      const correct = label === question.answer
      setSelected(label)
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

  function chipBg(label: string): string {
    if (answerState === 'unanswered') return 'var(--color-surface)'
    if (label === question.answer) return 'var(--color-correct)'
    if (label === selected) return 'var(--color-wrong)'
    return 'var(--color-surface)'
  }

  function chipColor(label: string): string {
    if (answerState === 'unanswered') return 'var(--color-text)'
    if (label === question.answer || label === selected) return '#fff'
    return 'var(--color-text)'
  }

  const progress = `${index + 1} / ${questions.length}`

  return (
    <div style={styles.container}>
      <p style={styles.progress}>{question.diagramTitle} — {progress}</p>

      <div style={styles.imageWrap}>
        <img
          src={`${imageBase}${question.image}`}
          alt={question.diagramTitle}
          style={styles.image}
        />
        <div
          style={{
            ...styles.marker,
            left: `${question.x}%`,
            top: `${question.y}%`,
            background: answerState === 'correct'
              ? 'var(--color-correct)'
              : answerState === 'wrong'
              ? 'var(--color-wrong)'
              : 'var(--color-accent)',
            animation: answerState === 'unanswered' ? 'diagram-pulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      <div style={styles.options}>
        {question.options.map((label) => (
          <button
            key={label}
            style={{
              ...styles.chip,
              background: chipBg(label),
              color: chipColor(label),
              opacity: answerState !== 'unanswered' && label !== question.answer && label !== selected ? 0.4 : 1,
            }}
            onClick={() => handleSelect(label)}
            disabled={answerState !== 'unanswered'}
          >
            {label}
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
    gap: 16,
    padding: '0 16px',
  },
  progress: {
    fontSize: 13,
    color: 'var(--color-muted)',
    textAlign: 'center',
  },
  imageWrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
    background: '#fff',
  },
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  marker: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '3px solid #fff',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.25)',
    transition: 'background 0.2s',
  },
  options: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  chip: {
    padding: '14px 8px',
    borderRadius: 'var(--radius)',
    fontSize: 15,
    fontWeight: 600,
    border: '2px solid var(--color-border)',
    boxShadow: 'var(--shadow)',
    transition: 'background 0.2s, color 0.2s, opacity 0.2s',
    textAlign: 'center',
  },
}
