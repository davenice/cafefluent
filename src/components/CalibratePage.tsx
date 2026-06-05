import { useState, useRef, useCallback } from 'react'
import { MODULES } from '../data/modules'

interface Hotspot {
  id: string
  label: string
  x: number
  y: number
}

interface Diagram {
  id: string
  title: string
  image: string
  hotspots: Hotspot[]
}

interface ModuleData {
  diagrams?: Diagram[]
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function CalibratePage() {
  const [moduleId, setModuleId] = useState('')
  const [diagrams, setDiagrams] = useState<Diagram[]>([])
  const [diagramIndex, setDiagramIndex] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [dragging, setDragging] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const mod = MODULES.find((m) => m.id === moduleId)

  function loadModule(id: string) {
    setModuleId(id)
    setLoadState('loading')
    const m = MODULES.find((mm) => mm.id === id)
    if (!m) { setLoadState('error'); return }
    fetch(m.dataUrl)
      .then((r) => r.json())
      .then((data: ModuleData) => {
        if (!data.diagrams?.length) { setLoadState('error'); return }
        setDiagrams(data.diagrams)
        setDiagramIndex(0)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }

  const getPercent = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const x = Math.round(((clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((clientY - rect.top) / rect.height) * 100)
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
  }, [])

  function moveHotspot(id: string, x: number, y: number) {
    setDiagrams((prev) =>
      prev.map((d, i) =>
        i !== diagramIndex
          ? d
          : { ...d, hotspots: d.hotspots.map((h) => (h.id === id ? { ...h, x, y } : h)) }
      )
    )
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    const pos = getPercent(e)
    if (pos) moveHotspot(dragging, pos.x, pos.y)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging) return
    e.preventDefault()
    const pos = getPercent(e)
    if (pos) moveHotspot(dragging, pos.x, pos.y)
  }

  function copyJson() {
    const diagram = diagrams[diagramIndex]
    const items = diagram.hotspots.map((h) => JSON.stringify(h)).join(',\n        ')
    const text = `"hotspots": [\n        ${items}\n      ]`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const diagram = diagrams[diagramIndex]

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Hotspot Calibration</h1>

      {loadState === 'idle' && (
        <div style={styles.picker}>
          <p style={styles.label}>Select a module with diagrams:</p>
          {MODULES.filter((m) => m.id === 'coffee').map((m) => (
            <button key={m.id} style={styles.moduleBtn} onClick={() => loadModule(m.id)}>
              {m.title}
            </button>
          ))}
        </div>
      )}

      {loadState === 'loading' && <p style={styles.status}>Loading…</p>}
      {loadState === 'error' && <p style={styles.status}>No diagrams found in this module.</p>}

      {loadState === 'ready' && diagram && (
        <>
          {diagrams.length > 1 && (
            <div style={styles.tabs}>
              {diagrams.map((d, i) => (
                <button
                  key={d.id}
                  style={{ ...styles.tab, ...(i === diagramIndex ? styles.tabActive : {}) }}
                  onClick={() => setDiagramIndex(i)}
                >
                  {d.title}
                </button>
              ))}
            </div>
          )}

          <p style={styles.hint}>Drag the dots to the correct positions, then copy the JSON and replace the entire "hotspots": […] block in data.json.</p>

          <div
            style={styles.imageWrap}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setDragging(null)}
            onMouseLeave={() => setDragging(null)}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setDragging(null)}
          >
            <img
              ref={imgRef}
              src={`${mod!.imageBase}${diagram.image}`}
              alt={diagram.title}
              style={styles.image}
              draggable={false}
            />
            {diagram.hotspots.map((h) => (
              <div
                key={h.id}
                style={{
                  ...styles.dot,
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  background: dragging === h.id ? '#e63946' : '#1a1a2e',
                }}
                onMouseDown={(e) => { e.preventDefault(); setDragging(h.id) }}
                onTouchStart={(e) => { e.preventDefault(); setDragging(h.id) }}
              >
                <span style={styles.dotLabel}>{h.label}</span>
              </div>
            ))}
          </div>

          <div style={styles.coords}>
            {diagram.hotspots.map((h) => (
              <div key={h.id} style={styles.coordRow}>
                <span style={styles.coordLabel}>{h.label}</span>
                <span style={styles.coordVal}>x={h.x} y={h.y}</span>
              </div>
            ))}
          </div>

          <button style={styles.copyBtn} onClick={copyJson}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '24px 16px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
  },
  picker: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    fontSize: 14,
    color: 'var(--color-muted)',
  },
  moduleBtn: {
    background: 'var(--color-surface)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'left',
    boxShadow: 'var(--shadow)',
  },
  status: {
    color: 'var(--color-muted)',
    textAlign: 'center',
    padding: 32,
  },
  tabs: {
    display: 'flex',
    gap: 8,
  },
  tab: {
    flex: 1,
    padding: '10px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '2px solid var(--color-border)',
    fontSize: 13,
    fontWeight: 600,
    background: 'var(--color-surface)',
  },
  tabActive: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
  },
  hint: {
    fontSize: 13,
    color: 'var(--color-muted)',
    textAlign: 'center',
  },
  imageWrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow)',
    background: '#fff',
    userSelect: 'none',
    touchAction: 'none',
  },
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
    pointerEvents: 'none',
  },
  dot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2px solid #fff',
    transform: 'translate(-50%, -50%)',
    cursor: 'grab',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    touchAction: 'none',
  },
  dotLabel: {
    position: 'absolute',
    top: 22,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    padding: '1px 4px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  coords: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  coordRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
  },
  coordLabel: {
    color: 'var(--color-text)',
    fontWeight: 500,
  },
  coordVal: {
    color: 'var(--color-muted)',
    fontFamily: 'monospace',
  },
  copyBtn: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '14px',
    fontSize: 16,
    fontWeight: 600,
    width: '100%',
    boxShadow: 'var(--shadow)',
  },
}
