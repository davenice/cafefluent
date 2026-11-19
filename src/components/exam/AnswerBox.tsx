import { ANSWER_LIMITS, ANSWER_ROWS, type AnswerKind } from '../../exam/types'

interface Props {
  kind: AnswerKind
  value: string
  onChange: (value: string) => void
  /** Labels the box for screen readers; the question itself is above it. */
  label: string
}

/** Show the count only near the limit: a counter on screen the whole time reads as pressure. */
const WARN_WITHIN = 20

/**
 * One typed answer.
 *
 * The keyboard settings are the exam's, not the browser's: **autocorrect is
 * off**, because if spelling is part of what is being judged then an iPhone
 * quietly rewriting "ciabatta" means marking the phone instead of the learner.
 * Capitalising the start of a sentence is left on — that is ordinary keyboard
 * behaviour everywhere and isn't what the exam is testing.
 *
 * Nothing here validates what was typed. A learner may switch to a non-Latin
 * keyboard mid-answer, and the course leader is the one marking.
 */
export default function AnswerBox({ kind, value, onChange, label }: Props) {
  const limit = ANSWER_LIMITS[kind]
  const rows = ANSWER_ROWS[kind]
  const left = limit - value.length

  // Shared so the single-line and multi-line boxes can't drift apart.
  const common = {
    value,
    maxLength: limit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    'aria-label': label,
    autoCorrect: 'off',
    autoCapitalize: 'sentences',
    spellCheck: false,
    autoComplete: 'off',
  }

  return (
    <div style={styles.wrap}>
      {rows === 1 ? (
        // No form around it, so Enter does nothing here — which is what we want.
        // Enter must never mean "next": in the boxes below it starts a new line.
        <input type="text" {...common} style={styles.input} />
      ) : (
        <textarea {...common} rows={rows} style={{ ...styles.input, ...styles.textarea }} />
      )}
      {left <= WARN_WITHIN && (
        <p style={styles.count} aria-live="polite">
          {left === 0 ? 'That is as much as you can write here.' : `${left} letters left`}
        </p>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    width: '100%',
  },
  input: {
    width: '100%',
    background: 'var(--color-surface)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '14px 12px',
    // 16px or more, or iOS zooms the page in when the box is focused.
    fontSize: 17,
    color: 'var(--color-text)',
    fontFamily: 'inherit',
  },
  textarea: {
    resize: 'vertical',
    lineHeight: 1.45,
  },
  count: {
    marginTop: 6,
    fontSize: 13,
    color: 'var(--color-muted)',
    textAlign: 'right',
  },
}
