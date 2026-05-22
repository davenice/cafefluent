import { Link } from 'react-router-dom'
import { MODULES } from '../data/modules'
import { getProgress } from '../hooks/useProgress'

export default function HomePage() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>CafeFluent</h1>
        <p style={styles.subtitle}>Learn the language of the cafe</p>
      </header>

      <main style={styles.main}>
        {MODULES.map((mod) => {
          const completedTasks = mod.tasks.filter(
            (t) => getProgress(mod.id, t.id) !== null
          ).length
          return (
            <Link key={mod.id} to={`/${mod.id}`} style={styles.card}>
              <div style={styles.cardBody}>
                <h2 style={styles.cardTitle}>{mod.title}</h2>
                <p style={styles.cardDesc}>{mod.description}</p>
              </div>
              <div style={styles.badge}>
                {completedTasks}/{mod.tasks.length}
              </div>
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
    padding: '40px 0 24px',
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    color: 'var(--color-primary)',
  },
  subtitle: {
    marginTop: 6,
    color: 'var(--color-muted)',
    fontSize: 15,
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
    padding: '18px 16px',
    boxShadow: 'var(--shadow)',
    gap: 12,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 600,
  },
  cardDesc: {
    marginTop: 4,
    fontSize: 13,
    color: 'var(--color-muted)',
  },
  badge: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 20,
    padding: '4px 10px',
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
}
