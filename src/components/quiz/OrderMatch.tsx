import { useState, useEffect, useCallback, useRef } from 'react'
import type { AllergenItem, NoneOption, OrderItem } from '../../types'
import { buildOrderQuestions, type OrderQuestion } from './questionBuilders'
import { useQuizRun, type AnswerProps, type AnswerState } from './useQuizRun'

interface Props {
  orders: OrderItem[]
  items: AllergenItem[]
  noneOption: NoneOption
  audioBase: string
  onComplete: (score: number, total: number) => void
}

function audioFile(base: string, order: OrderItem): string {
  return `${base}${order.id}_name.mp3`
}

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The module's own quiz: every order, asked once. */
export default function OrderMatch({ orders, items, noneOption, audioBase, onComplete }: Props) {
  const [questions] = useState(() => buildOrderQuestions(orders, items, noneOption))
  const run = useQuizRun(questions, onComplete)
  // A fresh renderer per question, so playback state starts clean each time.
  return <OrderMatchQuestion key={run.index} audioBase={audioBase} {...run} />
}

export interface OrderMatchQuestionProps extends AnswerProps {
  question: OrderQuestion
  audioBase: string
  index: number
  total: number
}

export function OrderMatchQuestion({
  question,
  audioBase,
  index,
  total,
  selected,
  answerState,
  onAnswer,
}: OrderMatchQuestionProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(audioFile(audioBase, question.order))
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => setIsPlaying(false)
    audio.onerror = () => setIsPlaying(false)
    audio.play().catch(() => setIsPlaying(false))
  }, [audioBase, question.order])

  // Auto-play when the question changes
  useEffect(() => {
    const timer = setTimeout(playAudio, 300)
    return () => {
      clearTimeout(timer)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>
        <p style={styles.counter}>{index + 1} of {total}</p>
        <p style={styles.instruction}>Which milk is in this order?</p>

        <button
          style={{ ...styles.playBtn, ...(isPlaying ? styles.playBtnActive : {}) }}
          onClick={playAudio}
          aria-label={isPlaying ? 'Playing…' : 'Play audio'}
        >
          <SpeakerIcon playing={isPlaying} />
        </button>

        {/* The order is only written out once it has been answered: it is there
            to be heard, and reading it answers the question. */}
        {answerState === 'unanswered'
          ? <p style={styles.replayHint}>{isPlaying ? 'Playing…' : 'Tap to replay'}</p>
          : <p style={styles.order}>{sentenceCase(question.order.text)}</p>}
      </div>

      <div style={styles.options}>
        {question.options.map((option) => (
          <button
            key={option.id}
            style={optionStyle(option.id, question.answer.id, selected, answerState)}
            onClick={() => onAnswer(option.id, option.id === question.answer.id)}
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
    padding: '16px 20px',
    fontSize: 16,
    fontWeight: 500,
    textAlign: 'left',
    color,
    opacity,
    boxShadow: 'var(--shadow)',
    transition: 'border-color 0.2s, background 0.2s, opacity 0.2s, color 0.2s',
  }
}

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {playing ? (
        <>
          <line x1="15.54" y1="8.46" x2="15.54" y2="8.46" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </>
      ) : (
        <>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" strokeOpacity="0.3" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeOpacity="0.3" />
        </>
      )}
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: '0 16px',
  },
  prompt: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '24px 16px 20px',
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  counter: {
    fontSize: 13,
    color: 'var(--color-muted)',
    fontWeight: 500,
  },
  instruction: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  playBtn: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(26,26,46,0.25)',
    transition: 'transform 0.1s, box-shadow 0.1s',
    flexShrink: 0,
  },
  playBtnActive: {
    transform: 'scale(0.95)',
    boxShadow: '0 2px 8px rgba(26,26,46,0.15)',
  },
  replayHint: {
    fontSize: 13,
    color: 'var(--color-muted)',
  },
  order: {
    fontSize: 19,
    fontWeight: 700,
    color: 'var(--color-primary)',
    lineHeight: 1.4,
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
}
