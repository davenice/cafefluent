import { ANSWER_LIMITS, ANSWER_ROWS, type AnswerKind } from '../../exam/types'

interface Props {
  kind: AnswerKind
  value: string
  onChange: (value: string) => void
  /** Labels the box for screen readers; the question itself is above it. */
  label: string
  /**
   * Move on. Called when Enter is pressed in a one-line box, where Enter has no
   * other meaning. Never called from the taller boxes: there Enter starts a new
   * line, and a learner part way through a sentence must not be jumped past the
   * question.
   */
  onDone?: () => void
  /** What the phone's Enter key should say, when Enter does something. */
  enterKeyHint?: 'next' | 'done'
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
export default function AnswerBox({ kind, value, onChange, label, onDone, enterKeyHint }: Props) {
  const limit = ANSWER_LIMITS[kind]
  const rows = ANSWER_ROWS[kind]
  const left = limit - value.length

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || !onDone) return
    // Enter also commits a candidate in Chinese, Japanese and Korean input
    // methods. Moving on then would throw away the word being typed, so wait
    // until the keyboard has finished with it.
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    onDone()
  }

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
        <input
          type="text"
          {...common}
          onKeyDown={handleKeyDown}
          enterKeyHint={enterKeyHint}
          style={styles.input}
        />
      ) : (
        // No onKeyDown: here Enter is how you start a new line.
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
