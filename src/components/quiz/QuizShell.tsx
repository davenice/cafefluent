import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MODULES } from '../../data/modules'
import { saveProgress } from '../../hooks/useProgress'
import ScoreScreen, { ErrorScreen } from './ScoreScreen'
import type { ModuleData } from '../../types'
import ImageMatch from './ImageMatch'
import AudioMatch from './AudioMatch'
import SentenceMatch from './SentenceMatch'
import RevisionTask from './RevisionTask'
import ProductMatch from './ProductMatch'
import DiagramLabel from './DiagramLabel'
import DiagramAudio from './DiagramAudio'
import IngredientMatch from './IngredientMatch'
import AllergenMatch from './AllergenMatch'
import OrderMatch from './OrderMatch'
import SequenceOrder from './SequenceOrder'

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
            imageFit={mod.imageFit}
            imageLegend={mod.imageLegend}
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
            imageFit={mod.imageFit}
            imageLegend={mod.imageLegend}
            showDescription={!mod.hideDescriptionInQuiz}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'ingredient-match' && (
          <IngredientMatch
            items={data.items}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'allergen-match' && (
          <AllergenMatch
            items={data.items}
            imageBase={mod.imageBase}
            imageFit={mod.imageFit}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'order-match' && (
          data.noneOption
            ? <OrderMatch
                orders={data.orders ?? []}
                items={data.items}
                noneOption={data.noneOption}
                audioBase={mod.audioBase ?? ''}
                onComplete={handleComplete}
              />
            : <ErrorScreen onBack={() => navigate(`/${moduleId}`)} message="This quiz has no orders yet." />
        )}
        {phase === 'quiz' && data && task.type === 'audio-match' && (
          <AudioMatch
            items={data.items}
            audioBase={mod.audioBase ?? '/content/allergens/audio/'}
            variants={task.audioVariants}
            answerWith={task.answerWith}
            imageBase={mod.imageBase}
            imageFit={mod.imageFit}
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
        {phase === 'quiz' && data && task.type === 'product-match' && (
          <ProductMatch
            products={data.products ?? []}
            imageBase={mod.imageBase}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'diagram-label' && (
          <DiagramLabel
            diagrams={data.diagrams ?? []}
            imageBase={mod.imageBase}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'diagram-audio' && (
          <DiagramAudio
            diagrams={data.diagrams ?? []}
            imageBase={mod.imageBase}
            audioBase={mod.audioBase ?? ''}
            onComplete={handleComplete}
          />
        )}
        {phase === 'quiz' && data && task.type === 'sequence-order' && (() => {
          const sequence = data.sequences?.find((s) => s.id === task.sequenceId) ?? data.sequences?.[0]
          return sequence
            ? <SequenceOrder key={sequence.id} sequence={sequence} onComplete={handleComplete} />
            : <ErrorScreen onBack={() => navigate(`/${moduleId}`)} message="This quiz has no steps yet." />
        })()}
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
