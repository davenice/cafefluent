import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MODULES } from '../../data/modules'
import { saveProgress } from '../../hooks/useProgress'
import type { ModuleData } from '../../types'
import ImageMatch from './ImageMatch'
import AudioMatch from './AudioMatch'
import SentenceMatch from './SentenceMatch'
import RevisionTask from './RevisionTask'

type Phase = 'loading' | 'error' | 'quiz' | 'score'

export default function QuizShell() {
  const { moduleId, taskId } = useParams<{ moduleId: string; taskId: string }>()
  const navigate = useNavigate()

  const mod = MODULES.find((m) => m.id === moduleId)
  const task = mod?.tasks.find((t) => t.id === taskId)

  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<ModuleData | null>(null)
  const [finalScore, setFinalScore] = useState<{ score: number; total: number } | null>(null)

  useEffect(() => {
    if (!mod || !task) { setPhase('error'); return }
    fetch(mod.dataUrl)
      .then((r) => r.json())
      .then((json: ModuleData) => {
        setData(json)
        setPhase('quiz')
      })
      .catch(() => setPhase('error'))
  }, [mod, task])

  function handleComplete(score: number, total: number) {
    if (mod && task) {
      saveProgress(mod.id, task.id, { score, total, completedAt: new Date().toISOString() })
    }
    setFinalScore({ score, total })
    setPhase('score')
  }

  if (!mod || !task) {
    return <ErrorScreen onBack={() => navigate('/')} message="Quiz not found." />
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => navigate(`/${moduleId}`)}>← {mod.title}</button>
        <h1 style={styles.title}>{task.title}</h1>
      </header>

      <main style={styles.main}>
        {phase === 'loading' && <p style={styles.status}>Loading…</p>}
        {phase === 'error' && <ErrorScreen onBack={() => navigate(`/${moduleId}`)} message="Could not load quiz data." />}
        {phase === 'quiz' && data && task.type === 'revision' && (
          <RevisionTask
            items={data.items}
            imageBase={mod.imageBase}
            intro={mod.revisionIntro}
            onDone={() => {
              if (mod && task) saveProgress(mod.id, task.id, { score: 1, total: 1, completedAt: new Date().toISOString() })
              navigate(`/${moduleId}`)
            }}
          />
        )}
        {phase === 'quiz' && data && task.type === 'image-match' && (
          <ImageMatch
            items={data.items}
            imageBase={mod.imageBase}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'audio-match' && (
          <AudioMatch
            items={data.items}
            audioBase={mod.audioBase ?? '/content/allergens/audio/'}
            variants={task.audioVariants}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'sentence-match' && (
          <SentenceMatch
            items={data.items}
            audioBase={mod.audioBase ?? '/content/allergens/audio/'}
            imageBase={mod.imageBase}
            onComplete={handleComplete}
          />
        )}
        {phase === 'score' && finalScore && (
          <ScoreScreen
            score={finalScore.score}
            total={finalScore.total}
            onRetry={() => { setFinalScore(null); setPhase('quiz') }}
            onBack={() => navigate(`/${moduleId}`)}
          />
        )}
      </main>
    </div>
  )
}

function ScoreScreen({
  score, total, onRetry, onBack,
}: {
  score: number; total: number; onRetry: () => void; onBack: () => void
}) {
  const pct = Math.round((score / total) * 100)
  return (
    <div style={scoreStyles.container}>
      <div style={scoreStyles.circle}>
        <span style={scoreStyles.pct}>{pct}%</span>
        <span style={scoreStyles.fraction}>{score}/{total}</span>
      </div>
      <p style={scoreStyles.label}>{pct === 100 ? 'Perfect!' : pct >= 70 ? 'Well done!' : 'Keep practising!'}</p>
      <button style={scoreStyles.primary} onClick={onRetry}>Try again</button>
      <button style={scoreStyles.secondary} onClick={onBack}>Back to module</button>
    </div>
  )
}

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-muted)', marginBottom: 16 }}>{message}</p>
      <button style={scoreStyles.secondary} onClick={onBack}>Go back</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    padding: '24px 16px 16px',
  },
  back: {
    fontSize: 14,
    color: 'var(--color-muted)',
    marginBottom: 8,
    display: 'block',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
  },
  main: {
    flex: 1,
    paddingBottom: 32,
  },
  status: {
    textAlign: 'center',
    padding: 32,
    color: 'var(--color-muted)',
  },
}

const scoreStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: '40px 16px',
  },
  circle: {
    width: 140,
    height: 140,
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pct: {
    fontSize: 36,
    fontWeight: 700,
    lineHeight: 1,
  },
  fraction: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  label: {
    fontSize: 20,
    fontWeight: 600,
  },
  primary: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    width: '100%',
    maxWidth: 280,
  },
  secondary: {
    background: 'transparent',
    color: 'var(--color-muted)',
    borderRadius: 'var(--radius)',
    padding: '12px 32px',
    fontSize: 15,
  },
}
