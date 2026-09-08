import type { AllergenItem } from '../../types'

interface Props {
  items: AllergenItem[]
  imageBase: string
  intro?: string
  imageFit?: 'cover' | 'contain'
  imageLegend?: string
  onDone: () => void
}

const DEFAULT_INTRO = 'There are 14 major allergens that must be declared on food labels. Learn their names and what they include.'

export default function RevisionTask({
  items, imageBase, intro = DEFAULT_INTRO, imageFit = 'cover', imageLegend, onDone,
}: Props) {
  // Diagrams need a wider frame than photos: they are letterboxed rather than cropped.
  const imageStyle = { ...styles.image, objectFit: imageFit, ...(imageFit === 'contain' ? styles.imageContain : {}) }
  return (
    <div style={styles.container}>
      <p style={styles.intro}>{intro}</p>
      {imageLegend && (
        <img
          src={`${imageBase}${imageLegend}`}
          alt="Key: hatching is espresso, white is steamed milk, dots are foam, solid is chocolate powder, waves are water"
          style={styles.legend}
        />
      )}
      <div style={styles.grid}>
        {items.map((item) => (
          <div key={item.id} style={styles.card}>
            <img
              src={`${imageBase}${item.image}`}
              alt={item.name}
              style={{ ...imageStyle, objectPosition: item.imagePosition ?? 'center' }}
            />
            <div style={styles.body}>
              <h2 style={styles.name}>{item.name}</h2>
              <p style={styles.desc}>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
      <button style={styles.doneBtn} onClick={onDone}>
        Mark revision complete
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
  legend: {
    width: '100%',
    maxWidth: 340,
    display: 'block',
    margin: '0 auto 22px',
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
  imageContain: {
    width: 124,
    height: 104,
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
