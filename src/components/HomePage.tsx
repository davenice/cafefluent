import { Link } from 'react-router-dom'
import { MODULES, DESCRIBE_GAME } from '../data/modules'
import { getProgress } from '../hooks/useProgress'
import { useEnabledModules } from '../hooks/useEnabledModules'

export default function HomePage() {
  const enabledModules = useEnabledModules()
  const visibleModules = MODULES.filter(m => (enabledModules ?? []).includes(m.id))
  const showGame = (enabledModules ?? []).includes(DESCRIBE_GAME.id)

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <img
          src={`${import.meta.env.BASE_URL}brand/real-hope-leeds.webp`}
          alt="Real Hope Leeds"
          style={styles.logo}
        />
        <div>
          <h1 style={styles.title}>CafeFluent</h1>
          <p style={styles.subtitle}>Learn the language of the cafe</p>
        </div>
      </header>

      <main style={styles.main}>
        {visibleModules.map((mod) => {
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

      {showGame && (
        <section style={styles.games}>
          <h2 style={styles.sectionTitle}>Table games</h2>
          <Link to={`/${DESCRIBE_GAME.id}`} style={{ ...styles.card, ...styles.gameCard }}>
            <div style={styles.cardBody}>
              <h2 style={styles.cardTitle}>{DESCRIBE_GAME.title}</h2>
              <p style={styles.cardDesc}>{DESCRIBE_GAME.description}</p>
            </div>
            <span style={styles.arrow}>›</span>
          </Link>
        </section>
      )}
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
    padding: '32px 0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  // The logo has a white background, so clip it to its circle against the page colour.
  logo: {
    width: 88,
    height: 88,
    flexShrink: 0,
    borderRadius: '50%',
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
  games: {
    marginTop: 32,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-muted)',
  },
  // Not a module with tasks to complete, so it looks different from the module cards.
  gameCard: {
    borderLeft: '4px solid var(--color-accent)',
  },
  arrow: {
    fontSize: 22,
    color: 'var(--color-muted)',
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
