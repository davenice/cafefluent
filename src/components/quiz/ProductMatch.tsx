import { useState } from 'react'
import type { ProductItem } from '../../types'
import { buildProductQuestions, type ProductQuestion } from './questionBuilders'
import { useQuizRun, type AnswerProps, type AnswerState, type RunDelays } from './useQuizRun'

interface Props {
  products: ProductItem[]
  imageBase: string
  onComplete: (score: number, total: number) => void
}

// Shorter than the other quizzes': there is only a name to read in the feedback.
const DELAYS: RunDelays = { correct: 1000, wrong: 2200 }

/** The module's own quiz: every product, asked once. */
export default function ProductMatch({ products, imageBase, onComplete }: Props) {
  const [questions] = useState(() => buildProductQuestions(products))
  const run = useQuizRun(questions, onComplete, DELAYS)
  return <ProductMatchQuestion imageBase={imageBase} {...run} />
}

export interface ProductMatchQuestionProps extends AnswerProps {
  question: ProductQuestion
  imageBase: string
  index: number
  total: number
}

export function ProductMatchQuestion({
  question,
  imageBase,
  index,
  total,
  selected,
  answerState,
  onAnswer,
}: ProductMatchQuestionProps) {
  function handleSelect(option: string) {
    onAnswer(option, option === question.correct)
  }

  return (
    <div style={styles.container}>
      <div style={styles.imageWrap}>
        <img
          src={`${imageBase}${question.product.image}`}
          alt=""
          style={styles.image}
        />
        <div style={styles.badge}>
          {index + 1} of {total}
        </div>
      </div>

      <div style={styles.prompt}>
        <p style={styles.promptText}>What is this product called?</p>
      </div>

      <div style={styles.options}>
        {question.options.map((option) => (
          <button
            key={option}
            style={optionStyle(option, question.correct, selected, answerState)}
            onClick={() => handleSelect(option)}
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
  correct: string,
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
    fontSize: 15,
    fontWeight: 500,
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
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
    aspectRatio: '16/9',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
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
  promptText: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
}
