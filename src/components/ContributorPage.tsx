// The page a contributor's personal link opens (record.html?t=<token>). Checks the
// link, asks for consent once, then shows the recorder, which sends each clip to
// the server as it is saved.

import { useEffect, useState } from 'react'
import RecordPage, { type Contributor } from './RecordPage'
import { ApiError, RecordingsApi, type Me } from '../recorder/api'

type State =
  | { kind: 'loading' }
  | { kind: 'no-link' }
  | { kind: 'not-set-up' }
  | { kind: 'bad-link' }
  | { kind: 'error' }
  | { kind: 'consent'; me: Me }
  | { kind: 'ready'; contributor: Contributor }

const API_URL = import.meta.env.VITE_RECORDINGS_API_URL as string | undefined

const token = new URLSearchParams(window.location.search).get('t')

function initialState(): State {
  // Built without the recordings Lambda's URL (VITE_RECORDINGS_API_URL), so no link can work yet.
  if (!API_URL) return { kind: 'not-set-up' }
  return token ? { kind: 'loading' } : { kind: 'no-link' }
}

export default function ContributorPage() {
  const [api] = useState(() => (token && API_URL ? new RecordingsApi(API_URL, token) : null))
  const [state, setState] = useState<State>(initialState)
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!api) return
    let cancelled = false
    api.me().then(
      (me) => {
        if (!cancelled) setState(me.consented ? { kind: 'ready', contributor: { me, api } } : { kind: 'consent', me })
      },
      (e) => {
        if (!cancelled) setState({ kind: e instanceof ApiError && e.status === 401 ? 'bad-link' : 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  async function giveConsent(me: Me) {
    if (!api) return
    setSaving(true)
    setConsentError(false)
    try {
      await api.consent()
      setState({ kind: 'ready', contributor: { me: { ...me, consented: true }, api } })
    } catch {
      setConsentError(true)
    } finally {
      setSaving(false)
    }
  }

  if (state.kind === 'ready') return <RecordPage contributor={state.contributor} />

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Voice recorder</h1>

      {state.kind === 'loading' && <p style={styles.muted}>Loading…</p>}

      {(state.kind === 'no-link' || state.kind === 'bad-link') && (
        <div style={styles.card}>
          <p>
            {state.kind === 'no-link' ? 'This page needs your personal link.' : 'This link does not work. It may have been stopped.'}
          </p>
          <p>Ask the person who sent it to you for a new link.</p>
        </div>
      )}

      {state.kind === 'not-set-up' && (
        <div style={styles.card}>
          <p>Recording is not open yet. Please try again later.</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div style={styles.card}>
          <p>We could not connect. Check your internet connection.</p>
          <button
            style={styles.primaryBtn}
            onClick={() => {
              setState({ kind: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === 'consent' && (
        <div style={styles.card}>
          <p>Hello, {state.me.name}. Thank you for helping.</p>
          <p>You will read short words and sentences out loud. We record your voice.</p>
          <p>
            We use your recordings in CafeFluent, an app for people learning English to work in a cafe. Learners will
            hear your voice.
          </p>
          <p>Each recording is sent to us as soon as you make it. You can ask us to delete your recordings at any time.</p>
          <label style={styles.check}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            I agree to my voice being recorded and used in CafeFluent.
          </label>
          {consentError && <p style={styles.error}>That did not work. Check your internet connection and try again.</p>}
          <button style={styles.primaryBtn} disabled={!agreed || saving} onClick={() => giveConsent(state.me)}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto' },
  heading: { fontSize: 20, fontWeight: 700 },
  card: { background: 'var(--color-surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  check: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, fontWeight: 600 },
  muted: { fontSize: 13, color: 'var(--color-muted)' },
  error: { fontSize: 14, color: 'var(--color-wrong)' },
  primaryBtn: { padding: '12px 20px', fontSize: 16, fontWeight: 600, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer' },
}
