import { useState, useEffect, useCallback, useRef } from 'react'
import type { AllergenItem } from '../../types'
import { shuffle, pickRandom } from '../../utils/shuffle'

type Variant = 'allergic' | 'intolerant' | 'must-not-eat' | 'cant-eat' | 'allergy-to' | 'cant-have'

// Keep in sync with VARIANTS in scripts/generate-audio.mjs
const DISPLAY_TEMPLATES: Record<Variant, (name: string) => string> = {
  allergic:       (name) => `I'm allergic to ${name}`,
  intolerant:     (name) => `I'm intolerant to ${name}`,
  'must-not-eat': (name) => `I must not eat ${name}`,
  'cant-eat':     (name) => `I can't eat ${name}`,
  'allergy-to':   (name) => `I have an allergy to ${name}`,
  'cant-have':    (name) => `I can't have ${name}`,
}

const BLANK_TEMPLATES: Record<Variant, string> = {
  allergic:       "I'm allergic to …",
  intolerant:     "I'm intolerant to …",
  'must-not-eat': "I must not eat …",
  'cant-eat':     "I can't eat …",
  'allergy-to':   "I have an allergy to …",
  'cant-have':    "I can't have …",
}

const ALL_VARIANTS: Variant[] = ['allergic', 'intolerant', 'must-not-eat', 'cant-eat', 'allergy-to', 'cant-have']

interface Props {
  items: AllergenItem[]
  audioBase: string
  imageBase: string
  onComplete: (score: number, total: number) => void
}

interface Question {
  answer: AllergenItem
  variant: Variant
  options: AllergenItem[]
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

function buildQuestions(items: AllergenItem[]): Question[] {
  return shuffle(items).map((answer) => ({
    answer,
    variant: ALL_VARIANTS[Math.floor(Math.random() * ALL_VARIANTS.length)],
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
  }))
}

function audioFile(base: string, item: AllergenItem, variant: Variant): string {
  return `${base}${item.id}_${variant}.mp3`
}

export default function SentenceMatch({ items, audioBase, imageBase, onComplete }: Props) {
  const [questions] = useState<Question[]>(() => buildQuestions(items))
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
  }, [audioBase, question.answer, question.variant])

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
        onComplete(score + (answerState === 'correct' ? 1 : 0), questions.length)
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
      return <span style={{ ...styles.overlay, background: 'rgba(45,106,79,0.5)' }}>✓</span>
    }
    if (option.id === selected) {
      return <span style={{ ...styles.overlay, background: 'rgba(193,18,31,0.75)' }}>✗</span>
    }
    return null
  }

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>
        <p style={styles.counter}>{index + 1} of {questions.length}</p>
        <p style={styles.sentence}>
          {answerState !== 'unanswered'
            ? DISPLAY_TEMPLATES[question.variant](question.answer.name)
            : BLANK_TEMPLATES[question.variant]}
        </p>
        <button
          style={{ ...styles.playBtn, ...(isPlaying ? styles.playBtnActive : {}) }}
          onClick={playAudio}
          aria-label={isPlaying ? 'Playing…' : 'Play audio'}
        >
          <SpeakerIcon playing={isPlaying} />
        </button>
        <p style={styles.replayHint}>{isPlaying ? 'Playing…' : 'Tap to replay'}</p>
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
              style={styles.optionImg}
            />
            {overlay(option)}
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
  sentence: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-primary)',
    lineHeight: 1.4,
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
