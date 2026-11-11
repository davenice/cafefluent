/**
 * The end of a quiz, and the dead end when one can't be shown. Shared by a
 * module's own quiz and the mixed quiz, which differ only in where "back" goes.
 */
export default function ScoreScreen({
  score, total, onRetry, onBack, backLabel = 'Back to module', details,
}: {
  score: number
  total: number
  onRetry: () => void
  onBack: () => void
  backLabel?: string
  /** Shown between the score and the buttons: the mixed quiz's module summary. */
  details?: React.ReactNode
}) {
  const pct = Math.round((score / total) * 100)
  return (
    <div style={scoreStyles.container}>
      <div style={scoreStyles.circle}>
        <span style={scoreStyles.pct}>{pct}%</span>
        <span style={scoreStyles.fraction}>{score}/{total}</span>
      </div>
      <p style={scoreStyles.label}>{pct === 100 ? 'Perfect!' : pct >= 70 ? 'Well done!' : 'Keep practising!'}</p>
      {details}
      <button style={scoreStyles.primary} onClick={onRetry}>Try again</button>
      <button style={scoreStyles.secondary} onClick={onBack}>{backLabel}</button>
    </div>
  )
}

export function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-muted)', marginBottom: 16 }}>{message}</p>
      <button style={scoreStyles.secondary} onClick={onBack}>Go back</button>
    </div>
  )
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
