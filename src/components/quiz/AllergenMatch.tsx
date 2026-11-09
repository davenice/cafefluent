import { useState } from 'react'
import type { AllergenItem } from '../../types'
import { buildAllergenQuestions, type AllergenQuestion } from './questionBuilders'
import { useQuizRun, type AnswerProps, type AnswerState, type RunDelays } from './useQuizRun'

interface Props {
  items: AllergenItem[]
  imageBase: string
  imageFit?: 'cover' | 'contain'
  onComplete: (score: number, total: number) => void
}

// Shorter than the other quizzes': there is only a name to read in the feedback.
const DELAYS: RunDelays = { correct: 1000, wrong: 2200 }

/** The module's own quiz: every item, asked once. */
export default function AllergenMatch({ items, onComplete, ...look }: Props) {
  const [questions] = useState(() => buildAllergenQuestions(items))
  const run = useQuizRun(questions, onComplete, DELAYS)
  return <AllergenMatchQuestion {...look} {...run} />
}

export interface AllergenMatchQuestionProps extends AnswerProps {
  question: AllergenQuestion
  imageBase: string
  imageFit?: 'cover' | 'contain'
  index: number
  total: number
}

export function AllergenMatchQuestion({
  question,
  imageBase,
  imageFit = 'cover',
  index,
  total,
  selected,
  answerState,
  onAnswer,
}: AllergenMatchQuestionProps) {
  const correct = question.answer.allergen

  return (
    <div style={styles.container}>
      <div style={styles.imageWrap}>
        <img
          src={`${imageBase}${question.answer.image}`}
          alt=""
          style={{ ...styles.image, objectFit: imageFit, objectPosition: question.answer.imagePosition ?? 'center' }}
        />
        <div style={styles.badge}>
          {index + 1} of {total}
        </div>
      </div>

      <div style={styles.prompt}>
        {/* The name is on screen: this asks what is in a milk the learner has
            already met, not which milk this is. */}
        <p style={styles.name}>{question.answer.name}</p>
        <p style={styles.promptText}>Which allergen is in it?</p>
      </div>

      <div style={styles.options}>
        {question.options.map((option) => (
          <button
            key={option}
            style={optionStyle(option, correct, selected, answerState)}
            onClick={() => onAnswer(option, option === correct)}
            disabled={answerState !== 'unanswered'}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function optionStyle(
  option: string,
  correct: string | undefined,
  selected: string | null,
  answerState: AnswerState
): React.CSSProperties {
  let borderColor = 'var(--color-border)'
  let background = 'var(--color-surface)'
  let color = 'var(--color-text)'
  let opacity = 1

  if (answerState !== 'unanswered') {
    if (option === correct) {
      borderColor = 'var(--color-correct)'
      background = '#d8f3dc'
      color = 'var(--color-correct)'
    } else if (option === selected) {
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
    gap: 16,
    padding: '0 16px',
  },
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
    background: 'var(--color-surface)',
    aspectRatio: '16/9',
  },
  image: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    background: 'rgba(0,0,0,0.45)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 20,
  },
  prompt: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-primary)',
    marginBottom: 4,
  },
  promptText: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-muted)',
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
}
