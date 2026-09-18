import { useState, useRef, useCallback } from 'react'
import type { SequenceData, SequenceStep } from '../../types'
import { shuffleSteps, moveItem, scoreSequence } from './sequenceLogic'

interface Props {
  sequence: SequenceData
  onComplete: (score: number, total: number) => void
}

// Every card occupies a fixed slot, so a pointer's Y position maps straight
// to a list index without any measuring.
const SLOT = 56
const GAP = 8
const STRIDE = SLOT + GAP

interface Drag {
  id: string
  fromIndex: number
  toIndex: number
  /** Card's current top, relative to the list. */
  y: number
  /** Where inside the card the pointer grabbed it. */
  grabOffset: number
  listTop: number
}

export default function SequenceOrder({ sequence, onComplete }: Props) {
  const steps = sequence.steps
  const correctOrder = steps.map((s) => s.id)
  const n = steps.length

  const [order, setOrder] = useState<string[]>(() => shuffleSteps(correctOrder))
  const [selected, setSelected] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [checked, setChecked] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const results = checked ? scoreSequence(order, correctOrder) : null
  const score = results ? results.filter(Boolean).length : 0

  // While dragging, preview the list with the dragged card already in its target slot.
  const displayOrder = drag ? moveItem(order, drag.fromIndex, drag.toIndex) : order

  const move = useCallback((id: string, delta: number) => {
    setOrder((o) => {
      const from = o.indexOf(id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= o.length) return o
      return moveItem(o, from, to)
    })
  }, [])

  function handleCardClick(step: SequenceStep) {
    if (checked) return
    setSelected((s) => (s === step.id ? null : step.id))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (checked || drag) return
    const list = listRef.current
    if (!list) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const listTop = list.getBoundingClientRect().top
    const fromIndex = order.indexOf(id)
    const slotTop = fromIndex * STRIDE
    setDrag({ id, fromIndex, toIndex: fromIndex, y: slotTop, grabOffset: e.clientY - listTop - slotTop, listTop })
    setSelected(null)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    const y = Math.max(0, Math.min((n - 1) * STRIDE, e.clientY - drag.listTop - drag.grabOffset))
    setDrag({ ...drag, y, toIndex: Math.round(y / STRIDE) })
  }

  function handlePointerUp() {
    if (!drag) return
    setOrder((o) => moveItem(o, drag.fromIndex, drag.toIndex))
    setDrag(null)
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'ArrowUp') { e.preventDefault(); move(id, -1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(id, 1) }
  }

  return (
    <div style={styles.container}>
      <p style={styles.instruction}>
        {checked
          ? `${score} of ${n} in the right order`
          : 'Drag the steps into the right order, then check.'}
      </p>

      {/* Cards are rendered in a fixed DOM order and positioned by index, so
          they animate between slots and keep focus while moving. */}
      <div ref={listRef} style={{ ...styles.list, height: n * STRIDE - GAP }}>
        {steps.map((step) => {
          const index = displayOrder.indexOf(step.id)
          const isDragging = drag?.id === step.id
          const isSelected = selected === step.id && !checked
          const result = results ? results[order.indexOf(step.id)] : null
          return (
            <div
              key={step.id}
              data-position={index + 1}
              onClick={() => handleCardClick(step)}
              style={{
                ...styles.card,
                top: isDragging && drag ? drag.y : index * STRIDE,
                transition: isDragging ? 'none' : 'top 0.15s ease, background 0.2s, color 0.2s',
                zIndex: isDragging ? 2 : 1,
                boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.18)' : 'var(--shadow)',
                transform: isDragging ? 'scale(1.02)' : 'none',
                borderColor: isSelected ? 'var(--color-primary)' : result === null ? 'var(--color-border)' : 'transparent',
                background: result === null ? 'var(--color-surface)' : result ? 'var(--color-correct)' : 'var(--color-wrong)',
                color: result === null ? 'var(--color-text)' : '#fff',
              }}
            >
              <span style={styles.num}>{index + 1}</span>
              <span style={styles.text}>{step.text}</span>
              {isSelected && (
                <span style={styles.arrows}>
                  <button
                    style={styles.arrow}
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={(e) => { e.stopPropagation(); move(step.id, -1) }}
                  >▲</button>
                  <button
                    style={styles.arrow}
                    aria-label="Move down"
                    disabled={index === n - 1}
                    onClick={(e) => { e.stopPropagation(); move(step.id, 1) }}
                  >▼</button>
                </span>
              )}
              {!checked && (
                <button
                  aria-label={`Drag to reorder: ${step.text}`}
                  style={{ ...styles.handle, cursor: isDragging ? 'grabbing' : 'grab' }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => handlePointerDown(e, step.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onKeyDown={(e) => handleKeyDown(e, step.id)}
                >⠿</button>
              )}
            </div>
          )
        })}
      </div>

      {!checked ? (
        <button style={styles.primary} onClick={() => { setSelected(null); setChecked(true) }}>
          Check my order
        </button>
      ) : (
        <>
          <div style={styles.answer}>
            <p style={styles.answerTitle}>The right order</p>
            <ol style={styles.answerList}>
              {steps.map((s) => <li key={s.id} style={styles.answerItem}>{s.text}</li>)}
            </ol>
          </div>
          <button style={styles.primary} onClick={() => onComplete(score, n)}>Continue</button>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '0 16px',
  },
  instruction: {
    fontSize: 14,
    color: 'var(--color-muted)',
    textAlign: 'center',
  },
  list: {
    position: 'relative',
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SLOT,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    borderRadius: 'var(--radius)',
    border: '2px solid var(--color-border)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  num: {
    width: 22,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
    opacity: 0.6,
  },
  text: {
    flex: 1,
    fontSize: 15,
    lineHeight: 1.25,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  arrows: {
    display: 'flex',
    flexShrink: 0,
  },
  arrow: {
    width: 36,
    height: SLOT - 4,
    fontSize: 14,
    color: 'var(--color-primary)',
  },
  handle: {
    width: 44,
    height: '100%',
    flexShrink: 0,
    fontSize: 20,
    color: 'var(--color-muted)',
    touchAction: 'none',
  },
  primary: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 280,
  },
  answer: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '14px 16px',
  },
  answerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-muted)',
    marginBottom: 8,
  },
  answerList: {
    paddingLeft: 22,
    fontSize: 14,
    lineHeight: 1.5,
  },
  answerItem: {
    paddingLeft: 4,
  },
}
