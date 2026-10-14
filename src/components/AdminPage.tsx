import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MODULES, DESCRIBE_GAME } from '../data/modules'
import { normaliseGameSettings, SECONDS_RANGE, TURNS_RANGE } from '../game/settings'

const API_URL = import.meta.env.VITE_MODULES_API_URL as string

type Screen = 'signIn' | 'modules'

export default function AdminPage() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('signIn')
  // The admin password. Held only for as long as the page is open, and sent on
  // each request; the browser's password manager is what remembers it.
  const [adminKey, setAdminKey] = useState('')
  const [signInError, setSignInError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [enabled, setEnabled] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  // Kept as typed until Save, so the textarea doesn't fight the user over blank lines.
  const [gameWords, setGameWords] = useState('')
  const [gameSeconds, setGameSeconds] = useState('')
  const [gameTurns, setGameTurns] = useState('')

  async function signIn(value: string) {
    setChecking(true)
    setSignInError(null)
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': value },
        body: JSON.stringify({}),
      })
      if (res.status === 401) {
        setSignInError('Incorrect password')
        setAdminKey('')
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data?.enabledModules)) {
        setSignInError('The server had a problem. Try again later.')
        setAdminKey('')
        return
      }
      setEnabled(data.enabledModules)
      const game = normaliseGameSettings(data.game)
      setGameWords(game.words.join('\n'))
      setGameSeconds(String(game.seconds))
      setGameTurns(String(game.turns))
      setScreen('modules')
    } catch {
      setSignInError('Could not reach the server. Check the connection.')
    } finally {
      setChecking(false)
    }
  }

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!checking && adminKey) signIn(adminKey)
  }

  function toggleModule(id: string) {
    setEnabled(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(false)
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          enabledModules: enabled,
          game: normaliseGameSettings({
            words: gameWords.split('\n'),
            seconds: Number(gameSeconds),
            turns: Number(gameTurns),
          }),
        }),
      })
      if (!res.ok) { setSaveError(true); return }
      navigate('/')
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (screen === 'signIn') {
    return (
      <div style={styles.page}>
        <div style={styles.signInGroup}>
          <form onSubmit={handleSignIn} style={styles.signInCard}>
            <h1 style={styles.title}>Admin</h1>
            {/* Not shown, and not typed into: it gives the password manager a name
                to file the saved password under. */}
            <input
              type="text"
              name="username"
              value="cafefluent-admin"
              readOnly
              tabIndex={-1}
              autoComplete="username"
              style={styles.hiddenField}
            />
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={adminKey}
                onChange={e => setAdminKey(e.target.value)}
                style={{ ...styles.passwordInput, ...(signInError ? styles.passwordInputError : {}) }}
                disabled={checking}
                autoFocus
              />
            </label>
            {signInError && <p style={styles.error}>{signInError}</p>}
            <button
              type="submit"
              disabled={checking || !adminKey}
              style={{ ...styles.signInButton, ...(checking || !adminKey ? styles.signInButtonDisabled : {}) }}
            >
              {checking ? 'Checking…' : 'Sign in'}
            </button>
          </form>
          {/* Outside the sign-in on purpose: volunteers recording on an installed app can't reach it by URL */}
          <Link to="/record" style={styles.toolLink}>Voice recorder →</Link>
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
          <div key={mod.id} style={styles.row}>
            <label style={styles.rowToggle}>
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
            {/* Opens the module directly, so it can be checked before it is switched on for learners */}
            <Link to={`/${mod.id}`} style={styles.previewLink}>Preview module →</Link>
          </div>
        ))}

        <h2 style={styles.sectionTitle}>Table games</h2>
        <div style={styles.row}>
          <label style={styles.rowToggle}>
            <div style={styles.rowBody}>
              <div style={styles.modTitle}>{DESCRIBE_GAME.title}</div>
              <div style={styles.modDesc}>{DESCRIBE_GAME.description}</div>
            </div>
            <input
              type="checkbox"
              checked={enabled.includes(DESCRIBE_GAME.id)}
              onChange={() => toggleModule(DESCRIBE_GAME.id)}
              style={styles.checkbox}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Words, one per line</span>
            <textarea
              value={gameWords}
              onChange={e => setGameWords(e.target.value)}
              rows={8}
              style={styles.textarea}
            />
          </label>
          <div style={styles.fieldRow}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Seconds per turn</span>
              <input
                type="number"
                inputMode="numeric"
                min={SECONDS_RANGE.min}
                max={SECONDS_RANGE.max}
                value={gameSeconds}
                onChange={e => setGameSeconds(e.target.value)}
                style={styles.numberInput}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Turns per game</span>
              <input
                type="number"
                inputMode="numeric"
                min={TURNS_RANGE.min}
                max={TURNS_RANGE.max}
                value={gameTurns}
                onChange={e => setGameTurns(e.target.value)}
                style={styles.numberInput}
              />
            </label>
          </div>
          <div style={styles.modDesc}>
            Turns are shared out between the players in order. Tables are scored on words guessed per turn, so tables of different sizes can be compared.
          </div>
          <Link to={`/${DESCRIBE_GAME.id}`} style={styles.previewLink}>Preview game →</Link>
        </div>
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
  signInGroup: {
    margin: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 280,
  },
  signInCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 16,
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
    textAlign: 'center',
  },
  passwordInput: {
    width: '100%',
    fontSize: 16,
    padding: '12px 14px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    background: 'var(--color-bg)',
  },
  passwordInputError: {
    borderColor: 'var(--color-wrong)',
  },
  signInButton: {
    padding: '14px',
    borderRadius: 'var(--radius)',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
  },
  signInButtonDisabled: {
    opacity: 0.5,
  },
  hiddenField: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    border: 0,
    opacity: 0,
    pointerEvents: 'none',
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
    flexDirection: 'column',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    boxShadow: 'var(--shadow)',
    gap: 10,
  },
  rowToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
  },
  toolLink: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-primary)',
    textDecoration: 'none',
  },
  previewLink: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-primary)',
    textDecoration: 'none',
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
  sectionTitle: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-muted)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  fieldRow: {
    display: 'flex',
    gap: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
  },
  textarea: {
    fontSize: 15,
    fontFamily: 'inherit',
    padding: '8px 10px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    resize: 'vertical',
  },
  numberInput: {
    fontSize: 15,
    padding: '8px 10px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    width: '100%',
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
