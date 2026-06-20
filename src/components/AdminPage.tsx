import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULES } from '../data/modules'

const API_URL = import.meta.env.VITE_MODULES_API_URL as string

type Screen = 'pin' | 'modules'

export default function AdminPage() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('pin')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [enabled, setEnabled] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  async function checkPin(value: string) {
    setChecking(true)
    setPinError(false)
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': value },
        body: JSON.stringify({}),
      })
      if (res.status === 401) {
        setPinError(true)
        setPin('')
        return
      }
      const data = await res.json()
      setEnabled(data.enabledModules)
      setScreen('modules')
    } catch {
      setPinError(true)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (pin.length === 6) checkPin(pin)
  }, [pin])

  function toggleModule(id: string) {
    setEnabled(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(false)
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ enabledModules: enabled }),
      })
      if (!res.ok) { setSaveError(true); return }
      navigate('/')
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (screen === 'pin') {
    return (
      <div style={styles.page}>
        <div style={styles.pinCard}>
          <h1 style={styles.title}>Admin</h1>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="····"
            style={{ ...styles.pinInput, ...(pinError ? styles.pinInputError : {}) }}
            disabled={checking}
            autoFocus
          />
          {pinError && <p style={styles.error}>Incorrect PIN</p>}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Modules</h1>
      </header>
      <main style={styles.list}>
        {MODULES.map(mod => (
          <label key={mod.id} style={styles.row}>
            <div style={styles.rowBody}>
              <div style={styles.modTitle}>{mod.title}</div>
              <div style={styles.modDesc}>{mod.description}</div>
            </div>
            <input
              type="checkbox"
              checked={enabled.includes(mod.id)}
              onChange={() => toggleModule(mod.id)}
              style={styles.checkbox}
            />
          </label>
        ))}
      </main>
      {saveError && <p style={styles.error}>Save failed — try again</p>}
      <footer style={styles.footer}>
        <button onClick={() => navigate('/')} style={styles.cancelButton}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </footer>
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
  pinCard: {
    margin: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    padding: '40px 32px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    width: '100%',
    maxWidth: 280,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  pinInput: {
    width: '100%',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 12,
    padding: '12px 16px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    background: 'var(--color-bg)',
  },
  pinInputError: {
    borderColor: 'var(--color-wrong)',
  },
  error: {
    color: 'var(--color-wrong)',
    fontSize: 13,
    textAlign: 'center',
  },
  header: {
    padding: '40px 0 24px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    boxShadow: 'var(--shadow)',
    gap: 12,
    cursor: 'pointer',
  },
  rowBody: {
    flex: 1,
  },
  modTitle: {
    fontSize: 16,
    fontWeight: 600,
  },
  modDesc: {
    marginTop: 3,
    fontSize: 12,
    color: 'var(--color-muted)',
  },
  checkbox: {
    width: 20,
    height: 20,
    flexShrink: 0,
    cursor: 'pointer',
    accentColor: 'var(--color-primary)',
  },
  footer: {
    display: 'flex',
    gap: 10,
    paddingTop: 24,
  },
  cancelButton: {
    flex: 1,
    padding: '14px',
    borderRadius: 'var(--radius)',
    border: '2px solid var(--color-border)',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-muted)',
  },
  saveButton: {
    flex: 2,
    padding: '14px',
    borderRadius: 'var(--radius)',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
  },
}
