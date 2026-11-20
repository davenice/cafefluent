import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FINAL_EXAM } from '../../data/finalExam'
import {
  loadModules,
  referenceProblems,
  referencedModules,
  resolvePrompt,
  type LoadedModules,
} from '../../exam/content'
import { answeredCount, buildMessage, type Answers } from '../../exam/message'
import { clear, hasWork, load, save, type ExamProgress } from '../../exam/storage'
import AnswerBox from './AnswerBox'

/** Long enough not to write on every keystroke, short enough to lose nothing. */
const SAVE_AFTER_MS = 300

type Phase = 'start' | 'question' | 'review' | 'send'

/**
 * The final exam: typed answers, no marking, sent to the tutor on WhatsApp.
 *
 * One question per screen. A scrolling form would put the question behind the
 * phone's keyboard, and there is no auto-advance anywhere — a learner part way
 * through a sentence must never be moved on.
 */
export default function FinalExamPage() {
  const navigate = useNavigate()
  const exam = FINAL_EXAM

  // Read once: reading again later would fight what is being typed.
  const [initial] = useState(load)
  const [name, setName] = useState(initial.name)
  const [answers, setAnswers] = useState<Answers>(initial.answers)
  const [sent, setSent] = useState(initial.sent)
  const keptWork = useMemo(() => hasWork(initial), [initial])

  const [phase, setPhase] = useState<Phase>('start')
  const [index, setIndex] = useState(0)

  const [modules, setModules] = useState<LoadedModules | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // The newest answers, for a save that has to happen right now rather than
  // after the debounce.
  const latest = useRef<ExamProgress>({ name, answers, sent })

  useEffect(() => {
    latest.current = { name, answers, sent }
    const timer = setTimeout(() => save(latest.current), SAVE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [name, answers, sent])

  // Write whatever has been typed the moment the page is taken away.
  //
  // The debounce above only fires once typing *stops*, so while someone is
  // steadily writing a sentence nothing has been saved yet — and that is
  // exactly when a call arrives, or iOS evicts a backgrounded PWA, and the
  // answers go with it. visibilitychange and pagehide are the last points a
  // phone reliably gives us; beforeunload is not delivered on iOS at all.
  useEffect(() => {
    const flush = () => save(latest.current)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  // Everything the questions point at, fetched before the exam can be started.
  useEffect(() => {
    let cancelled = false
    loadModules(referencedModules(exam.questions))
      .then((loaded) => {
        if (cancelled) return
        const problems = referenceProblems(exam.questions, loaded)
        if (problems.length > 0) {
          setProblem(`The exam paper does not match the app's content:\n${problems.join('\n')}`)
          return
        }
        setModules(loaded)
      })
      .catch((e: Error) => {
        if (!cancelled) setProblem(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [exam])

  const question = exam.questions[index]
  const answered = answeredCount(exam, answers)
  // Built during render, so a click handler has the string already: calling
  // share() or writeText() after an await loses the user activation on WebKit.
  const message = buildMessage(exam, name, answers)

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  /** Begin, or pick up where they left off. */
  function start() {
    setPhase(answered > 0 ? 'review' : 'question')
  }

  /** On to the next question, or to the answers if that was the last. */
  function goOn() {
    if (index === exam.questions.length - 1) setPhase('review')
    else setIndex(index + 1)
  }

  function goToQuestion(i: number) {
    setIndex(i)
    setPhase('question')
  }

  if (problem) {
    return (
      <Screen>
        <h1 style={styles.title}>{exam.title}</h1>
        <p style={styles.error}>The exam cannot be opened.</p>
        <pre style={styles.problem}>{problem}</pre>
        <p style={styles.muted}>Tell your tutor. Nothing you type here would be saved properly.</p>
      </Screen>
    )
  }

  if (!modules) {
    return (
      <Screen>
        <p style={styles.muted}>Loading the exam…</p>
      </Screen>
    )
  }

  if (phase === 'start') {
    return (
      <Screen>
        {/* Only here and on the last screen: mid-exam it would be a tap away
            from losing your place, and in an installed app on iOS there is no
            browser back button to undo it. */}
        <button style={styles.back} onClick={() => navigate('/')}>← Home</button>
        <h1 style={styles.title}>{exam.title}</h1>
        {exam.intro.map((line) => (
          <p key={line} style={styles.intro}>
            {line}
          </p>
        ))}

        {keptWork && <p style={styles.kept}>We kept your answers from last time.</p>}

        <label style={styles.field}>
          <span style={styles.fieldLabel}>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && name.trim()) start()
            }}
            enterKeyHint="go"
            style={styles.nameInput}
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            maxLength={60}
          />
        </label>
        <p style={styles.muted}>Your tutor needs your name to know whose answers these are.</p>

        <button
          style={{ ...styles.primary, ...(name.trim() ? {} : styles.disabled) }}
          disabled={!name.trim()}
          onClick={start}
        >
          {answered > 0 ? 'Carry on' : 'Start the exam'}
        </button>
      </Screen>
    )
  }

  if (phase === 'question') {
    const prompt = resolvePrompt(question.show, modules) ?? {}
    const last = index === exam.questions.length - 1
    return (
      <Screen>
        <p style={styles.counter}>
          Question {index + 1} of {exam.questions.length}
        </p>

        {prompt.image && <PromptImage src={prompt.image.src} fit={prompt.image.fit} />}
        {/* Keyed so each question gets its own, and **not** with the same key
            as the answer box below: two siblings sharing a key stops React
            reconciling them and it inserts copies instead of updating. */}
        {prompt.audio && <PlayButton src={prompt.audio} key={`sound-${question.id}`} />}

        <h1 style={styles.ask}>{question.ask}</h1>
        {question.guidance && <p style={styles.guidance}>{question.guidance}</p>}

        <AnswerBox
          // Its own box per question, so the focus above lands on each in turn.
          // Distinct from the play button's key; see the note there.
          key={`answer-${question.id}`}
          kind={question.answer}
          value={answers[question.id] ?? ''}
          onChange={(v) => setAnswer(question.id, v)}
          label={question.ask}
          onDone={goOn}
          enterKeyHint={last ? 'done' : 'next'}
        />

        <div style={styles.row}>
          <button
            style={{ ...styles.secondary, ...styles.inRow, ...(index === 0 ? styles.disabled : {}) }}
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            Back
          </button>
          <button style={{ ...styles.primary, ...styles.inRow }} onClick={goOn}>
            {last ? 'See my answers' : 'Next'}
          </button>
        </div>
        <button style={styles.quiet} onClick={() => setPhase('review')}>
          See all my answers
        </button>
      </Screen>
    )
  }

  if (phase === 'review') {
    return (
      <Screen>
        <h1 style={styles.title}>Your answers</h1>
        <p style={styles.muted}>
          You have answered {answered} of {exam.questions.length}. Tap a question to change your answer.
        </p>

        <ol style={styles.list}>
          {exam.questions.map((q, i) => {
            const text = (answers[q.id] ?? '').trim()
            // Several questions share their wording ("What is this called?"), so
            // the picture is the only thing telling them apart here.
            const thumb = resolvePrompt(q.show, modules)?.image
            return (
              <li key={q.id}>
                <button style={styles.reviewRow} onClick={() => goToQuestion(i)}>
                  <span style={styles.reviewNumber}>{i + 1}</span>
                  {thumb && (
                    <img src={thumb.src} alt="" style={{ ...styles.thumb, objectFit: thumb.fit }} />
                  )}
                  <span style={styles.reviewBody}>
                    <span style={styles.reviewAsk}>{q.ask}</span>
                    <span style={text ? styles.reviewAnswer : styles.reviewEmpty}>
                      {text || 'Not answered'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <button style={styles.primary} onClick={() => setPhase('send')}>
          I’ve finished answering
        </button>
        <button style={styles.quiet} onClick={() => goToQuestion(0)}>
          Back to question 1
        </button>
      </Screen>
    )
  }

  return (
    <SendScreen
      message={message}
      answered={answered}
      total={exam.questions.length}
      sent={sent}
      onSent={() => setSent(true)}
      onBack={() => setPhase('review')}
      onHome={() => navigate('/')}
      onClear={() => {
        clear()
        setName('')
        setAnswers({})
        setSent(false)
        setIndex(0)
        setPhase('start')
      }}
    />
  )
}

// ---------------------------------------------------------------- sending

type CopyState = 'idle' | 'done' | 'failed'

/**
 * One way to send, on purpose: copy the answers, paste them into WhatsApp.
 *
 * There was an "Open WhatsApp" button here too, using the Web Share API with a
 * wa.me link behind it. It went because two buttons on one screen each looked
 * like the way to send, and they wanted opposite things of the learner: sharing
 * hands WhatsApp the text, so there would be nothing left to paste, while the
 * line above the button was telling them to paste.
 *
 * Copying is also the only step whose success can honestly be reported — the
 * write either happened on this device or it didn't. Nothing here claims the
 * answers arrived, because nothing here can know. The learner says that
 * themselves, at the bottom.
 */
function SendScreen({
  message,
  answered,
  total,
  sent,
  onSent,
  onBack,
  onHome,
  onClear,
}: {
  message: string
  answered: number
  total: number
  sent: boolean
  onSent: () => void
  onBack: () => void
  onHome: () => void
  onClear: () => void
}) {
  const [copied, setCopied] = useState<CopyState>('idle')

  function copy() {
    // First statement, and nothing awaited before it: WebKit treats an awaited
    // call as being outside the tap and refuses it.
    const writing = navigator.clipboard?.writeText(message)
    if (!writing) {
      setCopied('failed')
      return
    }
    writing.then(
      () => setCopied('done'),
      () => setCopied('failed')
    )
  }

  if (sent) {
    return (
      <Screen>
        <h1 style={styles.title}>Thank you</h1>
        <p style={styles.intro}>Your tutor will read your answers.</p>
        <p style={styles.muted}>
          If your tutor did not get them, you can send them again — your answers are still here.
        </p>
        <button style={styles.primary} onClick={onBack}>
          Send them again
        </button>
        <button style={styles.quiet} onClick={onClear}>
          Clear my answers
        </button>
        <button style={styles.quiet} onClick={onHome}>
          Back to the app
        </button>
      </Screen>
    )
  }

  return (
    <Screen>
      <h1 style={styles.title}>Send your answers</h1>
      {answered < total && (
        <p style={styles.warn}>
          You have answered {answered} of {total}. You can still send them.
        </p>
      )}
      <p style={styles.intro}>These are your answers. Copy them, then paste them to your tutor on WhatsApp.</p>

      <textarea readOnly value={message} rows={12} style={styles.message} aria-label="Your answers" />

      <button style={styles.primary} onClick={copy}>
        Copy my answers
      </button>
      {copied === 'done' && <p style={styles.good}>Copied. Now open WhatsApp and paste it in your message.</p>}
      {copied === 'failed' && (
        <p style={styles.warn}>Press and hold the box above, choose Select All, then Copy.</p>
      )}

      <p style={styles.muted}>Or take a screenshot of the box above and send that to your tutor.</p>

      <button style={styles.primary} onClick={onSent}>
        I have sent my answers
      </button>
      <button style={styles.quiet} onClick={onBack}>
        Back to my answers
      </button>
    </Screen>
  )
}

// ---------------------------------------------------------------- pieces

function Screen({ children }: { children: React.ReactNode }) {
  return <div style={styles.page}>{children}</div>
}

function PromptImage({ src, fit }: { src: string; fit: 'cover' | 'contain' }) {
  return (
    <div style={styles.imageFrame}>
      {/* No alt text that names the thing: the name is the answer. */}
      <img src={src} alt="" style={{ ...styles.image, objectFit: fit }} />
    </div>
  )
}

/** The sound for a question, played on tap and replayable as often as they like. */
function PlayButton({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    []
  )

  function play() {
    audioRef.current?.pause()
    const audio = new Audio(src)
    audioRef.current = audio
    audio.onplay = () => setPlaying(true)
    audio.onended = () => setPlaying(false)
    audio.onerror = () => setPlaying(false)
    audio.play().catch(() => setPlaying(false))
  }

  return (
    <div style={styles.playWrap}>
      <button
        style={{ ...styles.play, ...(playing ? styles.playActive : {}) }}
        onClick={play}
        aria-label={playing ? 'Playing' : 'Play the sound'}
      >
        ►
      </button>
      <p style={styles.muted}>{playing ? 'Playing…' : 'Tap to listen again'}</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '28px 16px 40px',
    // dvh, not vh: the keyboard shrinks the visual viewport on iOS and vh does
    // not follow it, which would push the question off the screen.
    minHeight: '100dvh',
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  back: {
    fontSize: 14,
    color: 'var(--color-muted)',
    alignSelf: 'flex-start',
  },
  counter: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-muted)',
  },
  ask: {
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  guidance: {
    fontSize: 15,
    color: 'var(--color-muted)',
    marginTop: -6,
  },
  intro: {
    fontSize: 16,
    lineHeight: 1.5,
  },
  muted: {
    fontSize: 14,
    color: 'var(--color-muted)',
    lineHeight: 1.5,
  },
  kept: {
    fontSize: 15,
    color: 'var(--color-correct)',
    fontWeight: 600,
  },
  good: {
    fontSize: 15,
    color: 'var(--color-correct)',
    fontWeight: 600,
  },
  warn: {
    fontSize: 15,
    color: 'var(--color-accent)',
  },
  error: {
    fontSize: 16,
    color: 'var(--color-wrong)',
    fontWeight: 600,
  },
  problem: {
    fontSize: 13,
    whiteSpace: 'pre-wrap',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 12,
    fontFamily: 'ui-monospace, monospace',
  },
  imageFrame: {
    width: '100%',
    aspectRatio: '4 / 3',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
  },
  image: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  playWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '12px 0',
  },
  play: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 30,
    lineHeight: 1,
  },
  playActive: {
    background: 'var(--color-accent)',
  },
  field: {
    display: 'block',
    marginTop: 8,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
  },
  nameInput: {
    width: '100%',
    background: 'var(--color-surface)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '14px 12px',
    fontSize: 17,
    fontFamily: 'inherit',
    color: 'var(--color-text)',
  },
  message: {
    width: '100%',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 12,
    fontSize: 15,
    lineHeight: 1.5,
    fontFamily: 'ui-monospace, monospace',
    resize: 'vertical',
    color: 'var(--color-text)',
  },
  row: {
    display: 'flex',
    gap: 12,
    marginTop: 8,
  },
  // Sized like the app's other buttons, in ScoreScreen. Note there is no
  // `flex` here: the screen is a column, so a flexible button grows to fill
  // every pixel left on it and stops reading as a button at all.
  primary: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    width: '100%',
    maxWidth: 280,
    alignSelf: 'center',
    flexShrink: 0,
    marginTop: 8,
  },
  secondary: {
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    border: '2px solid var(--color-primary)',
    borderRadius: 'var(--radius)',
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    width: '100%',
    maxWidth: 280,
    alignSelf: 'center',
    flexShrink: 0,
    marginTop: 8,
  },
  /** Spread onto a button sitting beside another, where sharing the width is the point. */
  inRow: {
    flex: 1,
    maxWidth: 'none',
    marginTop: 0,
  },
  quiet: {
    background: 'transparent',
    color: 'var(--color-muted)',
    padding: '10px 0',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.4,
  },
  list: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    margin: '8px 0',
  },
  reviewRow: {
    display: 'flex',
    gap: 12,
    width: '100%',
    textAlign: 'left',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 14px',
    boxShadow: 'var(--shadow)',
  },
  reviewNumber: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-muted)',
    minWidth: 20,
  },
  thumb: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg)',
  },
  reviewBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
  },
  reviewAsk: {
    fontSize: 13,
    color: 'var(--color-muted)',
  },
  reviewAnswer: {
    fontSize: 16,
    whiteSpace: 'pre-wrap',
  },
  reviewEmpty: {
    fontSize: 15,
    color: 'var(--color-accent)',
  },
}
