import { Link, useParams, useNavigate } from 'react-router-dom'
import { MODULES } from '../data/modules'
import { getProgress } from '../hooks/useProgress'

export default function ModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const mod = MODULES.find((m) => m.id === moduleId)

  if (!mod) {
    return (
      <div style={styles.page}>
        <p>Module not found.</p>
        <Link to="/">Back</Link>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/')}>← Back</button>
        <h1 style={styles.title}>{mod.title}</h1>
        <p style={styles.desc}>{mod.description}</p>
      </header>

      <main style={styles.main}>
        {mod.tasks.map((task, i) => {
          const isRevision = task.type === 'revision'
          const progress = isRevision ? null : getProgress(mod.id, task.id)
          return (
            <Link key={task.id} to={`/${mod.id}/${task.id}`} style={styles.card}>
              <div style={{ ...styles.taskNumber, ...(isRevision ? styles.taskNumberRevision : {}) }}>
                {isRevision ? '★' : i}
              </div>
              <div style={styles.taskBody}>
                <h2 style={styles.taskTitle}>{task.title}</h2>
                {isRevision && <p style={styles.taskSub}>Study guide</p>}
                {progress && (
                  <p style={styles.taskScore}>
                    Best: {progress.score}/{progress.total}
                  </p>
                )}
              </div>
              <span style={styles.arrow}>›</span>
            </Link>
          )
        })}
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    padding: '0 16px 32px',
  },
  header: {
    padding: '24px 0 24px',
  },
  back: {
    fontSize: 14,
    color: 'var(--color-muted)',
    marginBottom: 12,
    display: 'block',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
  },
  desc: {
    marginTop: 6,
    fontSize: 14,
    color: 'var(--color-muted)',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    boxShadow: 'var(--shadow)',
    gap: 14,
  },
  taskNumber: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 15,
    flexShrink: 0,
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: 500,
  },
  taskNumberRevision: {
    background: '#7c6f5e',
    fontSize: 18,
  },
  taskSub: {
    marginTop: 2,
    fontSize: 12,
    color: 'var(--color-muted)',
  },
  taskScore: {
    marginTop: 2,
    fontSize: 12,
    color: 'var(--color-correct)',
    fontWeight: 600,
  },
  arrow: {
    fontSize: 22,
    color: 'var(--color-muted)',
  },
}
