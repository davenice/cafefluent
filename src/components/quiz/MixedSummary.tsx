import { Link } from 'react-router-dom'
import type { ModuleDef } from '../../types'

/** How one module's questions went in a mixed quiz. */
export interface ModuleResult {
  mod: ModuleDef
  asked: number
  right: number
}

/** Below this share of a module's questions, it is worth going back to it. */
const REVISE_BELOW = 0.7

/** The modules that went worst first, so the advice starts with the weakest. */
function worthRevising(results: ModuleResult[]): ModuleResult[] {
  return results
    .filter((r) => r.asked > 0 && r.right / r.asked < REVISE_BELOW)
    .sort((a, b) => a.right / a.asked - b.right / b.asked)
}

/**
 * How the quiz went, module by module, and which modules to go back to.
 * Shown under the score at the end of a mixed quiz.
 */
export default function MixedSummary({ results }: { results: ModuleResult[] }) {
  const byName = [...results].sort((a, b) => a.mod.title.localeCompare(b.mod.title))
  const revise = worthRevising(results)

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>How you did</h2>
      <ul style={styles.list}>
        {byName.map(({ mod, asked, right }) => (
          <li key={mod.id} style={styles.row}>
            <span style={styles.modTitle}>{mod.title}</span>
            <span style={{ ...styles.score, color: right / asked < REVISE_BELOW ? 'var(--color-wrong)' : 'var(--color-correct)' }}>
              {right} / {asked}
            </span>
          </li>
        ))}
      </ul>

      {revise.length > 0 ? (
        <div style={styles.advice}>
          <h2 style={styles.heading}>Practise these again</h2>
          {revise.map(({ mod }) => (
            <Link key={mod.id} to={`/${mod.id}`} style={styles.moduleLink}>
              {mod.title} <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <p style={styles.allGood}>You did well in every module.</p>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  heading: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-muted)',
    marginTop: 8,
  },
  list: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '4px 0',
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 16px',
  },
  modTitle: {
    fontSize: 15,
  },
  score: {
    fontSize: 15,
    fontWeight: 700,
  },
  advice: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  moduleLink: {
    display: 'block',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '14px 16px',
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  allGood: {
    fontSize: 15,
    color: 'var(--color-muted)',
    textAlign: 'center',
    padding: '4px 0 8px',
  },
}
