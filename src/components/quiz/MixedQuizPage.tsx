import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIXED_QUIZ, MODULES } from '../../data/modules'
import { useEnabledModules } from '../../hooks/useEnabledModules'
import { saveMixedProgress } from '../../hooks/useProgress'
import type { ModuleData } from '../../types'
import { buildMixedQuiz, type LoadedModule, type MixedQuestion } from './mixedQuestions'
import { useQuizRun, type AnswerProps } from './useQuizRun'
import ScoreScreen, { ErrorScreen } from './ScoreScreen'
import { ImageMatchQuestion } from './ImageMatch'
import { AudioMatchQuestion } from './AudioMatch'
import { SentenceMatchQuestion } from './SentenceMatch'
import { ProductMatchQuestion } from './ProductMatch'
import { DiagramLabelQuestion } from './DiagramLabel'
import { DiagramAudioQuestion } from './DiagramAudio'
import { IngredientMatchQuestion } from './IngredientMatch'
import { AllergenMatchQuestion } from './AllergenMatch'
import { OrderMatchQuestion } from './OrderMatch'

type Phase = 'loading' | 'error' | 'quiz' | 'score'

/** Everything a renderer needs that isn't the question or the module. */
type RunProps = AnswerProps & { index: number; total: number }

/**
 * A quiz drawing a few questions from every enabled module at once. Each
 * question is rendered by the same component that renders it inside its own
 * module, with that module's images, audio and look.
 */
export default function MixedQuizPage() {
  const navigate = useNavigate()
  const enabledModules = useEnabledModules()

  const [phase, setPhase] = useState<Phase>('loading')
  const [loaded, setLoaded] = useState<LoadedModule[]>([])
  const [questions, setQuestions] = useState<MixedQuestion[]>([])
  // Bumped to start again, so a retry asks a fresh set of questions.
  const [attempt, setAttempt] = useState(0)
  const [finalScore, setFinalScore] = useState<{ score: number; total: number } | null>(null)

  useEffect(() => {
    if (enabledModules === null) return
    let cancelled = false
    const wanted = MODULES.filter((mod) => enabledModules.includes(mod.id))

    Promise.all(
      wanted.map((mod) =>
        fetch(mod.dataUrl)
          .then((r) => r.json())
          .then((data: ModuleData) => ({ mod, data }))
          // One module that won't load shouldn't take the whole quiz down.
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return
      const modules = results.filter((r): r is LoadedModule => r !== null)
      const built = buildMixedQuiz(modules)
      setLoaded(modules)
      setQuestions(built)
      setPhase(built.length ? 'quiz' : 'error')
    })

    return () => { cancelled = true }
  }, [enabledModules])

  function handleComplete(score: number, total: number) {
    saveMixedProgress({ score, total, completedAt: new Date().toISOString() })
    setFinalScore({ score, total })
    setPhase('score')
  }

  function retry() {
    setQuestions(buildMixedQuiz(loaded))
    setAttempt((n) => n + 1)
    setFinalScore(null)
    setPhase('quiz')
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/')}>← Home</button>
        <h1 style={styles.title}>{MIXED_QUIZ.title}</h1>
      </header>

      <main style={styles.main}>
        {phase === 'loading' && <p style={styles.status}>Loading…</p>}
        {phase === 'error' && (
          <ErrorScreen onBack={() => navigate('/')} message="There are no quizzes to mix yet." />
        )}
        {phase === 'quiz' && <MixedRun key={attempt} questions={questions} onComplete={handleComplete} />}
        {phase === 'score' && finalScore && (
          <ScoreScreen
            score={finalScore.score}
            total={finalScore.total}
            onRetry={retry}
            onBack={() => navigate('/')}
            backLabel="Back to home"
          />
        )}
      </main>
    </div>
  )
}

function MixedRun({
  questions, onComplete,
}: {
  questions: MixedQuestion[]
  onComplete: (score: number, total: number) => void
}) {
  // `question` is pulled out, so what's left is exactly what a renderer needs
  // and the wrapper can't be spread over a renderer's own question prop.
  const { question: current, ...run } = useQuizRun(questions, onComplete)

  return (
    // Keyed by question, so each one is a fresh mount: the audio quizzes need
    // their playback state to start clean, as they do in their own module.
    <div
      key={run.index}
      data-testid="mixed-question"
      data-module={current.mod.id}
      data-task={current.task.id}
    >
      {renderQuestion(current, run)}
    </div>
  )
}

function renderQuestion(current: MixedQuestion, run: RunProps) {
  const { mod } = current
  switch (current.type) {
    case 'image-match':
      return (
        <ImageMatchQuestion
          {...run}
          question={current.question}
          imageBase={mod.imageBase}
          imageFit={mod.imageFit}
          imageLegend={mod.imageLegend}
          showDescription={!mod.hideDescriptionInQuiz}
        />
      )
    case 'audio-match':
      return (
        <AudioMatchQuestion
          {...run}
          question={current.question}
          audioBase={mod.audioBase ?? ''}
          answerWith={current.task.answerWith}
          imageBase={mod.imageBase}
          imageFit={mod.imageFit}
        />
      )
    case 'sentence-match':
      return (
        <SentenceMatchQuestion
          {...run}
          question={current.question}
          audioBase={mod.audioBase ?? ''}
          imageBase={mod.imageBase}
        />
      )
    case 'product-match':
      return <ProductMatchQuestion {...run} question={current.question} imageBase={mod.imageBase} />
    case 'diagram-label':
      return <DiagramLabelQuestion {...run} question={current.question} imageBase={mod.imageBase} />
    case 'diagram-audio':
      return (
        <DiagramAudioQuestion
          {...run}
          question={current.question}
          imageBase={mod.imageBase}
          audioBase={mod.audioBase ?? ''}
        />
      )
    case 'ingredient-match':
      return <IngredientMatchQuestion {...run} question={current.question} />
    case 'allergen-match':
      return (
        <AllergenMatchQuestion
          {...run}
          question={current.question}
          imageBase={mod.imageBase}
          imageFit={mod.imageFit}
        />
      )
    case 'order-match':
      return <OrderMatchQuestion {...run} question={current.question} audioBase={mod.audioBase ?? ''} />
  }
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
