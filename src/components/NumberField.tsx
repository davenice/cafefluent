// A number input that keeps what is typed until it makes sense. A controlled
// <input type="number"> fights the user: clearing it gives 0, and a half-typed
// "-" or "1." is not a number at all. Here the text is the field's own, and the
// value only changes when the text is a number in range. Leaving the field puts
// back the value in use.

import { useState } from 'react'

interface Props {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  style?: { field?: React.CSSProperties; input?: React.CSSProperties; hint?: React.CSSProperties }
}

export default function NumberField({ label, hint, value, onChange, min, max, style = {} }: Props) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const n = Number(text.trim().replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max

  return (
    <label style={style.field}>
      {label}
      <input
        style={style.input}
        type="text"
        inputMode="decimal"
        value={editing ? text : String(value)}
        aria-invalid={editing && !valid}
        onFocus={() => {
          setText(String(value))
          setEditing(true)
        }}
        onChange={(e) => {
          setText(e.target.value)
          const next = Number(e.target.value.trim().replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(next) && next >= min && next <= max) onChange(next)
        }}
        onBlur={() => setEditing(false)}
      />
      {editing && !valid ? (
        <span style={{ ...style.hint, color: 'var(--color-wrong)' }}>
          Enter a number from {min} to {max}.
        </span>
      ) : (
        hint && <span style={style.hint}>{hint}</span>
      )}
    </label>
  )
}
