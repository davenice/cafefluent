import { useState, useEffect, useCallback, useRef } from 'react'
import type { DiagramData, Hotspot } from '../../types'
import { buildDiagramAudioQuestions, type HotspotAudioQuestion } from './questionBuilders'
import { useQuizRun, type AnswerProps } from './useQuizRun'

interface Props {
  diagrams: DiagramData[]
  imageBase: string
  audioBase: string
  onComplete: (score: number, total: number) => void
}

function audioFile(base: string, hotspot: Hotspot): string {
  return `${base}${hotspot.id}_name.mp3`
}

/**
 * Hear the name of a part, then tap that part on the diagram.
 * The module's own quiz: every hotspot of every diagram, asked once.
 */
export default function DiagramAudio({ diagrams, imageBase, audioBase, onComplete }: Props) {
  const [questions] = useState(() => buildDiagramAudioQuestions(diagrams))
  const run = useQuizRun(questions, onComplete)
  // A fresh renderer per question, so playback state starts clean each time.
  return <DiagramAudioQuestion key={run.index} imageBase={imageBase} audioBase={audioBase} {...run} />
}

export interface DiagramAudioQuestionProps extends AnswerProps {
  question: HotspotAudioQuestion
  imageBase: string
  audioBase: string
  index: number
  total: number
}

/** Every hotspot of the current diagram is shown as a tappable marker. */
export function DiagramAudioQuestion({
  question,
  imageBase,
  audioBase,
  index,
  total,
  selected,
  answerState,
  onAnswer,
}: DiagramAudioQuestionProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(audioFile(audioBase, question.answer))
    audioRef.current = audio
    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => setIsPlaying(false)
    audio.onerror = () => setIsPlaying(false)
    audio.play().catch(() => setIsPlaying(false))
  }, [audioBase, question.answer])

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

  function handleSelect(hotspotId: string) {
    onAnswer(hotspotId, hotspotId === question.answer.id)
  }

  function markerStyle(hotspot: Hotspot): React.CSSProperties {
    const isAnswer = hotspot.id === question.answer.id
    const isSelected = hotspot.id === selected
    // Before answering: hollow rings that pulse together, so the picture is
    // regularly seen unobscured. After: the answer and any wrong tap fill solid.
    let borderColor = 'var(--color-primary)'
    let background = 'rgba(255,255,255,0.25)'
    let opacity = 1
    let scale = 1
    let animation = 'marker-pulse 2.4s ease-in-out infinite'

    if (answerState !== 'unanswered') {
      animation = 'none'
      if (isAnswer) {
        borderColor = '#fff'
        background = 'var(--color-correct)'
        scale = 1.25
      } else if (isSelected) {
        borderColor = '#fff'
        background = 'var(--color-wrong)'
      } else {
        opacity = 0.25
      }
    }

    return {
      ...styles.marker,
      left: `${hotspot.x}%`,
      top: `${hotspot.y}%`,
      borderColor,
      background,
      opacity,
      animation,
      transform: `translate(-50%, -50%) scale(${scale})`,
    }
  }

  // After answering, name the part so a wrong tap still teaches the word.
  const feedback =
    answerState === 'correct' ? `✓ ${question.answer.label}` :
    answerState === 'wrong' ? `✗ It was the ${question.answer.label}` :
    'Tap the part you hear'

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>
        <p style={styles.counter}>{question.diagram.title} — {index + 1} / {total}</p>

        <button
          style={{ ...styles.playBtn, ...(isPlaying ? styles.playBtnActive : {}) }}
          onClick={playAudio}
          aria-label={isPlaying ? 'Playing…' : 'Play audio'}
        >
          <SpeakerIcon playing={isPlaying} />
        </button>

        <p
          style={{
            ...styles.instruction,
            color: answerState === 'correct' ? 'var(--color-correct)'
              : answerState === 'wrong' ? 'var(--color-wrong)'
              : 'var(--color-text)',
          }}
        >
          {feedback}
        </p>
      </div>

      <div style={styles.imageWrap}>
        <img
          src={`${imageBase}${question.diagram.image}`}
          alt={question.diagram.title}
          style={styles.image}
        />
        {question.diagram.hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            style={markerStyle(hotspot)}
            onClick={() => handleSelect(hotspot.id)}
            disabled={answerState !== 'unanswered'}
            aria-label={answerState === 'unanswered' ? 'Part' : hotspot.label}
            data-testid={`hotspot-${hotspot.id}`}
          />
        ))}
      </div>
    </div>
  )
}

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      width="32"
      height="32"
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
    gap: 16,
    padding: '0 16px',
  },
  prompt: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '16px 16px 14px',
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  counter: {
    fontSize: 13,
    color: 'var(--color-muted)',
    fontWeight: 500,
  },
  instruction: {
    fontSize: 16,
    fontWeight: 600,
    transition: 'color 0.2s',
  },
  playBtn: {
    width: 64,
    height: 64,
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
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: '50%',
    border: '3px solid',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
    transition: 'background 0.2s, border-color 0.2s, opacity 0.2s, transform 0.2s',
    cursor: 'pointer',
  },
}
