import { useState, useEffect, useCallback, useRef } from 'react'
import type { AllergenItem } from '../../types'
import { buildAudioQuestions } from './questionBuilders'

interface Props {
  items: AllergenItem[]
  audioBase: string
  variants?: string[]
  onComplete: (score: number, total: number) => void
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

function audioFile(base: string, item: AllergenItem, variant: string): string {
  return `${base}${item.id}_${variant}.mp3`
}

export default function AudioMatch({ items, audioBase, variants = ['name'], onComplete }: Props) {
  const [questions] = useState(() => buildAudioQuestions(items, variants))
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const question = questions[index]

  const playAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(audioFile(audioBase, question.answer, question.variant))
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => setIsPlaying(false)
    audio.onerror = () => setIsPlaying(false)
    audio.play().catch(() => setIsPlaying(false))
  }, [audioBase, question.answer])

  // Auto-play when question changes
  useEffect(() => {
    setIsPlaying(false)
    const timer = setTimeout(playAudio, 300)
    return () => {
      clearTimeout(timer)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function optionStyle(option: AllergenItem): React.CSSProperties {
    let borderColor = 'var(--color-border)'
    let background = 'var(--color-surface)'
    let color = 'var(--color-text)'
    let opacity = 1

    if (answerState !== 'unanswered') {
      if (option.id === question.answer.id) {
        borderColor = 'var(--color-correct)'
        background = '#d8f3dc'
        color = 'var(--color-correct)'
      } else if (option.id === selected) {
        borderColor = 'var(--color-wrong)'
        background = '#fde8e8'
        color = 'var(--color-wrong)'
      } else {
        opacity = 0.4
      }
    }

    return { ...styles.optionBtn, borderColor, background, color, opacity }
  }

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>
        <p style={styles.counter}>{index + 1} of {questions.length}</p>
        <p style={styles.instruction}>What do you hear?</p>

        <button
          style={{ ...styles.playBtn, ...(isPlaying ? styles.playBtnActive : {}) }}
          onClick={playAudio}
          aria-label={isPlaying ? 'Playing…' : 'Play audio'}
        >
          <SpeakerIcon playing={isPlaying} />
        </button>

        <p style={styles.replayHint}>{isPlaying ? 'Playing…' : 'Tap to replay'}</p>
      </div>

      <div style={styles.options}>
        {question.options.map((option) => (
          <button
            key={option.id}
            style={optionStyle(option)}
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
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  optionBtn: {
    width: '100%',
    background: 'var(--color-surface)',
    border: '2px solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '16px 20px',
    fontSize: 16,
    fontWeight: 500,
    textAlign: 'left',
    boxShadow: 'var(--shadow)',
    transition: 'border-color 0.2s, background 0.2s, opacity 0.2s, color 0.2s',
  },
}
