// review.html: listen to every audio option for each phrase — the generated
// clip the app plays today, and each contributor's recording of it. Local only;
// the clips come from recordings/ through the dev server (scripts/reviewRecordings.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadScript, type Phrase } from '../recorder/script'
import { buildRows, filterRows, voices, type Clip, type Option, type Row, type Show } from '../review/clips'

const SHOW_LABELS: Record<Show, string> = {
  all: 'All phrases',
  recorded: 'Recorded',
  missing: 'Not recorded',
  problems: 'Worth a listen',
}

export default function ReviewPage() {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null)
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [module, setModule] = useState('all')
  const [show, setShow] = useState<Show>('recorded')

  useEffect(() => {
    let cancelled = false
    Promise.all([loadScript(), fetchClips()]).then(
      ([script, list]) => {
        if (cancelled) return
        setPhrases(script)
        setClips(list)
      },
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => (phrases && clips ? buildRows(phrases, clips) : []), [phrases, clips])
  const shown = useMemo(() => filterRows(rows, { module, show }), [rows, module, show])
  const modules = useMemo(() => {
    const seen = new Map<string, string>()
    for (const { phrase } of rows) seen.set(phrase.module, phrase.moduleTitle)
    return [...seen]
  }, [rows])
  const recorded = rows.filter((r) => r.recorded > 0).length
  // One player for the page, so starting a clip stops whatever was playing.
  const player = usePlayer()

  if (error) {
    return (
      <main style={styles.page}>
        <h1 style={styles.title}>Audio review</h1>
        <p style={styles.error}>Could not load the clips: {error}</p>
        <p style={styles.desc}>This page only works under <code>npm run dev</code>.</p>
      </main>
    )
  }
  if (!phrases || !clips) {
    return (
      <main style={styles.page}>
        <h1 style={styles.title}>Audio review</h1>
        <p style={styles.desc}>Loading…</p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Audio review</h1>
        <p style={styles.desc}>
          {recorded} of {rows.length} phrases have a recording · {clips.length} clips in <code>recordings/</code>
          {' · '}
          <code>npm run fetch:recordings</code> to update
        </p>
        <Voices clips={clips} />
        <div style={styles.filters}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Module</span>
            <select value={module} onChange={(e) => setModule(e.target.value)} style={styles.select}>
              <option value="all">All modules</option>
              {modules.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Show</span>
            <select value={show} onChange={(e) => setShow(e.target.value as Show)} style={styles.select}>
              {Object.entries(SHOW_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <span style={styles.count}>{shown.length} shown</span>
        </div>
      </header>

      {shown.length === 0 ? (
        <p style={styles.desc}>Nothing to show.</p>
      ) : (
        <ul style={styles.rows}>
          {shown.map((row) => (
            <PhraseRow key={`${row.phrase.module}/${row.phrase.file}`} row={row} player={player} />
          ))}
        </ul>
      )}
    </main>
  )
}

async function fetchClips(): Promise<Clip[]> {
  const res = await fetch('/recordings-api/clips.json')
  if (!res.ok) throw new Error(`the dev server answered ${res.status}`)
  return (await res.json()).clips as Clip[]
}

function Voices({ clips }: { clips: Clip[] }) {
  const list = voices(clips)
  if (list.length === 0) return <p style={styles.desc}>No recordings yet.</p>
  return (
    <ul style={styles.voices}>
      {list.map((v) => (
        <li key={v.contributor} style={styles.voice}>
          <strong>{v.contributor}</strong>
          <span style={styles.desc}>
            {v.clips} clip{v.clips === 1 ? '' : 's'} · typical peak {v.medianPeakDb} dB · average {v.medianRmsDb} dB
          </span>
        </li>
      ))}
    </ul>
  )
}

function PhraseRow({ row, player }: { row: Row; player: Player }) {
  const { playing, play, stop } = player
  const urls = row.options.map((o) => o.url)
  const mine = playing !== null && urls.includes(playing)

  return (
    <li style={styles.row}>
      <div style={styles.rowHead}>
        <div>
          <div style={styles.phrase}>{row.phrase.text}</div>
          <div style={styles.desc}>
            {row.phrase.moduleTitle} · {row.phrase.file.replace(/\.wav$/, '')}
          </div>
        </div>
        {row.recorded > 0 && (
          <button
            style={styles.smallButton}
            onClick={() => (mine ? stop() : play(urls))}
            aria-label={mine ? `Stop ${row.phrase.text}` : `Play every version of ${row.phrase.text}`}
          >
            {mine ? 'Stop' : 'Play all'}
          </button>
        )}
      </div>
      <div style={styles.options}>
        {row.options.map((option) => (
          <OptionButton
            key={option.url}
            option={option}
            playing={playing === option.url}
            onPlay={() => (playing === option.url ? stop() : play([option.url]))}
          />
        ))}
        {row.recorded === 0 && <span style={styles.desc}>No one has recorded this yet.</span>}
      </div>
    </li>
  )
}

function OptionButton({ option, playing, onPlay }: { option: Option; playing: boolean; onPlay: () => void }) {
  const { clip } = option
  const name = option.source === 'generated' ? 'Generated voice' : option.source
  return (
    <div style={{ ...styles.option, ...(playing ? styles.optionPlaying : null) }}>
      <button onClick={onPlay} style={styles.play} aria-label={`${playing ? 'Stop' : 'Play'} ${name}`}>
        {playing ? '■' : '▶'}
      </button>
      <div style={styles.optionBody}>
        <div style={styles.optionName}>{name}</div>
        {clip ? (
          <>
            <Level peakDb={clip.peakDb} rmsDb={clip.rmsDb} />
            <div style={styles.desc}>
              {(clip.durationMs / 1000).toFixed(1)}s · peak {clip.peakDb} dB · average {clip.rmsDb} dB
              {clip.leadMs > 400 && ` · ${(clip.leadMs / 1000).toFixed(1)}s before the words`}
              {clip.tailMs > 400 && ` · ${(clip.tailMs / 1000).toFixed(1)}s after`}
            </div>
          </>
        ) : (
          <div style={styles.desc}>Polly · what the app plays today</div>
        )}
        {option.warnings.length > 0 && <div style={styles.warning}>{option.warnings.join(' · ')}</div>}
      </div>
    </div>
  )
}

/** Average level as the filled bar, with the peak marked, both from -60 dBFS up. */
function Level({ peakDb, rmsDb }: { peakDb: number; rmsDb: number }) {
  const place = (level: number) => `${Math.max(0, Math.min(100, ((level + 60) / 60) * 100))}%`
  return (
    <div style={styles.level} aria-hidden="true">
      <div style={{ ...styles.levelFill, width: place(rmsDb) }} />
      <div style={{ ...styles.levelPeak, left: place(peakDb) }} />
    </div>
  )
}

interface Player {
  /** The url playing now, if any. */
  playing: string | null
  /** Play these one after another, stopping anything already playing. */
  play: (urls: string[]) => void
  stop: () => void
}

/** One clip at a time, or a list played one after another. */
function usePlayer(): Player {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const [playing, setPlaying] = useState<string | null>(null)

  const stop = useCallback(() => {
    queueRef.current = []
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(null)
  }, [])

  const play = useCallback(
    (urls: string[]) => {
      const start = (url: string) => {
        const audio = new Audio(url)
        audioRef.current = audio
        setPlaying(url)
        const next = () => {
          if (audioRef.current !== audio) return // already stopped or moved on
          const following = queueRef.current.shift()
          if (following) start(following)
          else stop()
        }
        audio.onended = next
        audio.onerror = next
        void audio.play().catch(() => {}) // a missing file ends up in onerror
      }
      stop()
      queueRef.current = urls.slice(1)
      start(urls[0])
    },
    [stop],
  )

  useEffect(() => () => void audioRef.current?.pause(), [])

  return { playing, play, stop }
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 24, maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', flexDirection: 'column', gap: 10 },
  title: { fontSize: 22 },
  desc: { fontSize: 12, color: 'var(--color-muted)' },
  error: { color: 'var(--color-wrong)', fontSize: 14 },
  warning: { fontSize: 12, color: 'var(--color-wrong)', fontWeight: 600 },
  voices: { listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 },
  voice: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', boxShadow: 'var(--shadow)' },
  filters: { display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: 600 },
  select: { fontSize: 14, padding: '6px 8px', border: '2px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: '#fff' },
  count: { fontSize: 12, color: 'var(--color-muted)', paddingBottom: 8 },
  rows: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--color-surface)', borderRadius: 'var(--radius)', padding: 16, boxShadow: 'var(--shadow)' },
  rowHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  phrase: { fontSize: 16, fontWeight: 600 },
  smallButton: { padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--color-border)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  options: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  option: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, flex: '1 1 260px', border: '2px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 10 },
  optionPlaying: { borderColor: 'var(--color-primary)', background: '#f3f4f6' },
  play: { width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 13 },
  optionBody: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 },
  optionName: { fontSize: 14, fontWeight: 600 },
  level: { position: 'relative', height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' },
  levelFill: { height: '100%', background: 'var(--color-correct)' },
  levelPeak: { position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--color-primary)' },
}
