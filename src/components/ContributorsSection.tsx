// The admin page's list of voice contributors: add someone and copy their
// personal recording link, see how far each has got, and revoke a link.
// Changes go to the recordings Lambda straight away; the page's Save button is
// only for modules and the game.

import { useEffect, useState } from 'react'
import { ApiError, RecordingsAdminApi, contributorLink, type ContributorSummary } from '../recorder/api'

const API_URL = import.meta.env.VITE_RECORDINGS_API_URL as string | undefined

type Load = 'loading' | 'ready' | 'unauthorised' | 'error'

export default function ContributorsSection({ adminKey }: { adminKey: string }) {
  const [api] = useState(() => (API_URL ? new RecordingsAdminApi(API_URL, adminKey) : null))
  const [contributors, setContributors] = useState<ContributorSummary[]>([])
  const [load, setLoad] = useState<Load>('loading')
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // The link just made. Shown once: the server keeps only a hash of the token.
  const [newLink, setNewLink] = useState<{ name: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!api) return
    let cancelled = false
    api.list().then(
      (list) => {
        if (cancelled) return
        setContributors(list)
        setLoad('ready')
      },
      (e) => {
        if (!cancelled) setLoad(e instanceof ApiError && e.status === 401 ? 'unauthorised' : 'error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!api || !name.trim() || adding) return
    setAdding(true)
    setActionError(null)
    try {
      const { contributor, token } = await api.add(name.trim())
      setContributors((list) => [...list, contributor])
      setNewLink({ name: contributor.name, url: contributorLink(token) })
      setCopied(false)
      setName('')
    } catch (err) {
      setActionError(err instanceof ApiError && err.status === 400 ? err.message : 'Could not add them. Try again.')
    } finally {
      setAdding(false)
    }
  }

  async function revoke(c: ContributorSummary) {
    if (!api || !window.confirm(`Stop ${c.name}’s link? They won’t be able to record any more. Their recordings are kept.`)) return
    setActionError(null)
    try {
      await api.revoke(c.id)
      setContributors((list) => list.map((x) => (x.id === c.id ? { ...x, revoked: true } : x)))
    } catch {
      setActionError(`Could not stop ${c.name}’s link. Try again.`)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard access: the link is selectable in the box instead.
      setCopied(false)
    }
  }

  return (
    <section style={styles.section} aria-labelledby="contributors-heading">
      <h2 id="contributors-heading" style={styles.sectionTitle}>Voice contributors</h2>
      <p style={styles.desc}>
        Each person gets their own link to record the app’s words and sentences. Changes here are saved straight away.
      </p>

      {!api && <p style={styles.error}>Recording isn’t set up: VITE_RECORDINGS_API_URL is empty.</p>}
      {load === 'loading' && api && <p style={styles.desc}>Loading…</p>}
      {load === 'unauthorised' && (
        <p style={styles.error}>
          The recordings server didn’t accept the password. ADMIN_KEY must be the same on both Lambdas.
        </p>
      )}
      {load === 'error' && (
        <div style={styles.row}>
          <p style={styles.error}>Could not load the contributors.</p>
          <button
            style={styles.smallButton}
            onClick={() => {
              setLoad('loading')
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}

      {load === 'ready' && (
        <>
          <form onSubmit={add} style={styles.row}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Amira Haddad"
                style={styles.input}
              />
            </label>
            <button type="submit" disabled={adding || !name.trim()} style={styles.addButton}>
              {adding ? 'Adding…' : 'Add and make link'}
            </button>
          </form>

          {newLink && (
            <div style={styles.newLink} role="status">
              <strong>Link for {newLink.name}</strong>
              <input
                readOnly
                value={newLink.url}
                aria-label={`Link for ${newLink.name}`}
                onFocus={(e) => e.target.select()}
                style={styles.input}
              />
              <div style={styles.buttons}>
                <button style={styles.smallButton} onClick={() => copy(newLink.url)}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button style={styles.smallButton} onClick={() => setNewLink(null)}>Done</button>
              </div>
              <span style={styles.warning}>
                This is the only time the link is shown. Copy it now and send it to {newLink.name} only. If it is lost,
                stop it and add them again.
              </span>
            </div>
          )}

          {actionError && <p style={styles.error}>{actionError}</p>}

          {contributors.length === 0 ? (
            <p style={styles.desc}>No one yet.</p>
          ) : (
            <ul style={styles.list}>
              {contributors.map((c) => (
                <li key={c.id} style={styles.contributor}>
                  <div style={styles.contributorBody}>
                    <div style={styles.name}>{c.name}</div>
                    <div style={styles.desc}>
                      {c.clips} recording{c.clips === 1 ? '' : 's'}
                      {' · '}
                      {c.revoked ? 'link stopped' : c.consented ? 'agreed' : 'not started'}
                      {' · added '}
                      {new Date(c.created).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                  {!c.revoked && (
                    <button style={styles.smallButton} onClick={() => revoke(c)} aria-label={`Stop ${c.name}’s link`}>
                      Stop link
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 32 },
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-muted)' },
  desc: { fontSize: 12, color: 'var(--color-muted)' },
  error: { color: 'var(--color-wrong)', fontSize: 13 },
  warning: { fontSize: 12, color: 'var(--color-wrong)', fontWeight: 600 },
  row: { display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--color-surface)', borderRadius: 'var(--radius)', padding: 16, boxShadow: 'var(--shadow)' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: 600 },
  input: { fontSize: 15, padding: '8px 10px', border: '2px solid var(--color-border)', borderRadius: 'var(--radius-sm)', width: '100%' },
  addButton: { padding: 12, borderRadius: 'var(--radius)', background: 'var(--color-primary)', color: '#fff', fontSize: 15, fontWeight: 600 },
  smallButton: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--color-border)', fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' },
  buttons: { display: 'flex', gap: 8 },
  newLink: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 'var(--radius)', background: '#fff8e1', border: '1px solid #f0c36d' },
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 },
  contributor: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius)', padding: '12px 16px', boxShadow: 'var(--shadow)' },
  contributorBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: 600 },
}
