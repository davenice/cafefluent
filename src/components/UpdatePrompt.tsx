import { useState } from 'react'
import { useMatch } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Browsers only check for a new service worker about once a day on their own,
// and an installed PWA resumed from the home screen may not check at all.
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export default function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  // Quiz progress is only saved on completion, so never offer a reload mid-task.
  const inTask = useMatch('/:moduleId/:taskId') !== null

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => { registration.update().catch(() => {}) }
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  // "Later" hides the bar for this session; the waiting worker is still there,
  // so the prompt comes back on the next launch.
  if (!needRefresh || dismissed || inTask) return null

  // The plugin only reloads after activation when the page was already controlled
  // by a worker. A hard-refreshed page is not, so reload on controllerchange ourselves,
  // with a fallback in case that event never arrives.
  function reloadWithNewVersion() {
    const reload = () => window.location.reload()
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true })
    setTimeout(reload, 3000)
    updateServiceWorker(true)
  }

  return (
    <div style={styles.bar}>
      <span style={styles.label}>A new version is ready</span>
      <div style={styles.actions}>
        <button style={styles.laterButton} onClick={() => setDismissed(true)}>
          Later
        </button>
        <button style={styles.button} onClick={reloadWithNewVersion}>
          Reload
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'fixed',
    bottom: 16,
    left: 16,
    right: 16,
    maxWidth: 448,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 12px 12px 16px',
    background: 'var(--color-primary)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    zIndex: 100,
  },
  label: {
    fontSize: 15,
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexShrink: 0,
  },
  laterButton: {
    padding: '8px 12px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 15,
    fontWeight: 600,
  },
  button: {
    padding: '8px 16px',
    background: 'var(--color-accent)',
    color: '#fff',
    borderRadius: 'var(--radius-sm)',
    fontSize: 15,
    fontWeight: 600,
  },
}
