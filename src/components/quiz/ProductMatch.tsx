import { useState, useEffect, useCallback } from 'react'
import type { AllergenItem, ProductItem } from '../../types'
import { shuffle } from '../../utils/shuffle'

interface Props {
  products: ProductItem[]
  items: AllergenItem[]
  imageBase: string
  onComplete: (score: number, total: number) => void
}

interface Question {
  product: ProductItem
  phase: 'name' | 'bread'
  options: string[]
  correct: string
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

function buildQuestions(products: ProductItem[], items: AllergenItem[]): Question[] {
  const allBreadAnswers = [...new Set(products.map((p) => p.breadAnswer))]

  return shuffle(products).flatMap((product) => {
    const nameOptions = shuffle(products.map((p) => p.name))

    const otherAnswers = allBreadAnswers.filter((a) => a !== product.breadAnswer)
    const itemDistractors = shuffle(
      items.filter((b) => !product.breadIds.includes(b.id)).map((b) => b.name)
    )
    const breadOptions = shuffle([product.breadAnswer, ...[...otherAnswers, ...itemDistractors].slice(0, 3)])

    return [
      { product, phase: 'name' as const, options: nameOptions, correct: product.name },
      { product, phase: 'bread' as const, options: breadOptions, correct: product.breadAnswer },
    ]
  })
}

export default function ProductMatch({ products, items, imageBase, onComplete }: Props) {
  const [questions] = useState<Question[]>(() => buildQuestions(products, items))
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')

  const question = questions[index]

  const handleSelect = useCallback(
    (option: string) => {
      if (answerState !== 'unanswered') return
      const correct = option === question.correct
      setSelected(option)
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

  const productNum = Math.floor(index / 2) + 1

  return (
    <div style={styles.container}>
      <div style={styles.imageWrap}>
        <img
          src={`${imageBase}${question.product.image}`}
          alt=""
          style={styles.image}
        />
        <div style={styles.badge}>
          {productNum} of {products.length}
        </div>
      </div>

      <div style={styles.prompt}>
        {question.phase === 'name' ? (
          <p style={styles.promptText}>What is this product called?</p>
        ) : (
          <>
            <p style={styles.productName}>{question.product.name}</p>
            <p style={styles.promptText}>What bread is it made with?</p>
          </>
        )}
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
  productName: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--color-primary)',
    marginBottom: 4,
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
