import type { AllergenItem } from '../../types'

interface Props {
  items: AllergenItem[]
  imageBase: string
  onDone: () => void
}

export default function AllergenRevision({ items, imageBase, onDone }: Props) {
  return (
    <div style={styles.container}>
      <p style={styles.intro}>
        There are 14 major allergens that must be declared on food labels.
        Learn their names and what they include.
      </p>
      <div style={styles.grid}>
        {items.map((item) => (
          <div key={item.id} style={styles.card}>
            <img
              src={`${imageBase}${item.image}`}
              alt={item.name}
              style={styles.image}
            />
            <div style={styles.body}>
              <h2 style={styles.name}>{item.name}</h2>
              <p style={styles.desc}>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
      <button style={styles.doneBtn} onClick={onDone}>
        Back to module
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '0 16px 40px',
  },
  intro: {
    fontSize: 14,
    color: 'var(--color-muted)',
    lineHeight: 1.5,
    marginBottom: 20,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  card: {
    display: 'flex',
    gap: 16,
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  },
  image: {
    width: 100,
    height: 100,
    objectFit: 'cover',
    flexShrink: 0,
  },
  body: {
    padding: '12px 12px 12px 0',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  desc: {
    fontSize: 13,
    color: 'var(--color-muted)',
    lineHeight: 1.5,
  },
  doneBtn: {
    marginTop: 28,
    width: '100%',
    padding: '14px 0',
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: 16,
    fontWeight: 600,
  },
}
