import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FINAL_EXAM } from '../../data/finalExam'
import {
  loadModules,
  referenceProblems,
  referencedModules,
  resolvePrompt,
  type LoadedModules,
} from '../../exam/content'
import type { AnswerKind, ExamQuestion } from '../../exam/types'

/**
 * The exam on paper, for a learner with no phone or a day when the app will not
 * cooperate. Print it from the browser; there is no PDF step.
 *
 * It is the blank paper only — no answers anywhere on it — so the same sheet can
 * be handed out.
 *
 * The listening questions say the tutor will read the phrase out rather than
 * printing it. What the clips say is perfectly reconstructable from the content
 * ("I can't eat peanuts"), but the thing being asked for *is* the food named in
 * the phrase, so printing it would be printing the answer. Read aloud it stays a
 * listening question, and arguably a better one than a recording.
 */
export default function PrintablePaper() {
  const navigate = useNavigate()
  const exam = FINAL_EXAM
  const [modules, setModules] = useState<LoadedModules | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadModules(referencedModules(exam.questions))
      .then((loaded) => {
        if (cancelled) return
        const problems = referenceProblems(exam.questions, loaded)
        if (problems.length > 0) setProblem(problems.join('\n'))
        else setModules(loaded)
      })
      .catch((e: Error) => {
        if (!cancelled) setProblem(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [exam])

  if (problem) {
    return (
      <div style={styles.page}>
        <p style={styles.error}>The paper cannot be printed.</p>
        <pre style={styles.problem}>{problem}</pre>
      </div>
    )
  }
  if (!modules) return <p style={styles.loading}>Loading the paper…</p>

  // Worked out rather than written down, so it stays true when the paper moves.
  const listening = exam.questions
    .map((q, i) => (q.show.kind.endsWith('audio') ? i + 1 : 0))
    .filter((n) => n > 0)

  return (
    <div className="exam-paper" style={styles.page}>
      <div className="screen-only" style={styles.bar}>
        <button style={styles.button} onClick={() => window.print()}>
          Print
        </button>
        <button style={styles.quiet} onClick={() => navigate('/admin')}>
          Back to admin
        </button>
        <p style={styles.hint}>
          Print to paper, or choose Save as PDF. You read the phrase out for{' '}
          {listening.length > 0 ? `question${listening.length > 1 ? 's' : ''} ${listNumbers(listening)}` : 'no questions'}
          , which {listening.length === 1 ? 'is' : 'are'} grouped at the front so you can do them in one go.
        </p>
      </div>

      <header style={styles.header}>
        <h1 style={styles.title}>{exam.title}</h1>
        <p style={styles.meta}>
          {exam.questions.length} questions · {exam.version}
        </p>
        <p style={styles.nameLine}>Name _______________________________ Date _______________</p>
      </header>

      <ol style={styles.list}>
        {exam.questions.map((q, i) => (
          <Question key={q.id} question={q} number={i + 1} modules={modules} />
        ))}
      </ol>

      <p style={styles.end}>End of the exam. Give this paper to your tutor.</p>
    </div>
  )
}

/** "1, 2, 3 and 4" */
function listNumbers(numbers: number[]): string {
  if (numbers.length < 2) return numbers.join('')
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

/** How many rows of writing the answer gets. */
const ROWS: Record<AnswerKind, number> = { word: 1, line: 1, sentence: 3, list: 4 }

/** Height of one row of writing, in px. About 9mm — adult handwriting with its descenders. */
const ROW = 34

/**
 * One question, with somewhere to write beside it.
 *
 * The answer used to be ruled lines running the full width underneath, which
 * read as a rule between questions rather than as a place to put anything. So
 * the writing area is now a bounded box to the right of the question, and the
 * full-width rule is what it already looked like: the separator.
 */
function Question({
  question,
  number,
  modules,
}: {
  question: ExamQuestion
  number: number
  modules: LoadedModules
}) {
  const prompt = resolvePrompt(question.show, modules) ?? {}
  const rows = ROWS[question.answer]
  return (
    <li className="exam-question" style={styles.question}>
      <div style={styles.row}>
        <div style={styles.prompt}>
          <p style={styles.ask}>
            <span style={styles.number}>{number}</span>
            {question.ask}
          </p>
          {question.guidance && <p style={styles.guidance}>{question.guidance}</p>}

          {prompt.image && (
            <div style={styles.pictures}>
              <img src={prompt.image.src} alt="" style={styles.picture} />
              {prompt.legend && <img src={prompt.legend} alt="" style={styles.legend} />}
            </div>
          )}
          {prompt.audio && <p style={styles.listen}>Your tutor will read this out.</p>}
        </div>

        <div style={{ ...styles.answer, height: rows * ROW }}>
          {Array.from({ length: rows }, (_, n) => (
            <span
              key={n}
              style={{
                flex: 1,
                // Faint guides inside the box; the box's own edge closes the last row.
                borderBottom: n < rows - 1 ? '1px solid #d4d4d4' : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </li>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '24px 20px 48px',
    background: '#fff',
    color: '#000',
  },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  button: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '12px 28px',
    fontSize: 16,
    fontWeight: 600,
  },
  quiet: {
    background: 'transparent',
    color: 'var(--color-muted)',
    fontSize: 15,
  },
  hint: {
    flexBasis: '100%',
    fontSize: 13,
    color: 'var(--color-muted)',
    lineHeight: 1.5,
  },
  header: {
    borderBottom: '2px solid #000',
    paddingBottom: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  nameLine: {
    fontSize: 15,
    marginTop: 16,
  },
  list: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  question: {
    // Kept whole: a picture on one page and its answer box on the next is no
    // use to anyone.
    breakInside: 'avoid',
    // Now genuinely a separator, which is what it always looked like.
    borderBottom: '1px solid #bbb',
    paddingBottom: 20,
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20,
    // Stacks instead of squashing if this is ever opened on a phone.
    flexWrap: 'wrap',
  },
  prompt: {
    flex: '1 1 300px',
  },
  answer: {
    flex: '0 0 240px',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #666',
    borderRadius: 2,
  },
  ask: {
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  number: {
    display: 'inline-block',
    minWidth: 28,
    fontWeight: 700,
  },
  guidance: {
    fontSize: 14,
    marginLeft: 28,
    marginTop: 2,
  },
  listen: {
    fontSize: 14,
    fontStyle: 'italic',
    marginLeft: 28,
    marginTop: 8,
  },
  pictures: {
    marginLeft: 28,
    marginTop: 10,
  },
  picture: {
    width: 240,
    maxWidth: '100%',
    display: 'block',
    border: '1px solid #ccc',
  },
  legend: {
    width: 320,
    maxWidth: '100%',
    display: 'block',
    marginTop: 6,
  },
  loading: {
    padding: 32,
    textAlign: 'center',
    color: 'var(--color-muted)',
  },
  error: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-wrong)',
  },
  problem: {
    fontSize: 13,
    whiteSpace: 'pre-wrap',
    fontFamily: 'ui-monospace, monospace',
    marginTop: 8,
  },
}
