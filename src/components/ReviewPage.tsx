// review.html: listen to every audio option for each phrase — the generated
// clip the app plays today, and each contributor's recording of it — pick the
// one to use, and mark the ones that are no good. Local only; the clips and the
// decisions file come through the dev server (scripts/reviewRecordings.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadScript, phraseKey, type Phrase } from '../recorder/script'
import {
  buildExport,
  buildRows,
  filterRows,
  progress,
  voices,
  type Clip,
  type Option,
  type PlayWhich,
  type Row,
  type Show,
  type Voice,
} from '../review/clips'
import { applyPatch, emptyDecisions, GENERATED, parseDecisions, type Decisions, type Patch } from '../review/decisions'

const SHOW_LABELS: Record<Show, string> = {
  all: 'All phrases',
  recorded: 'Recorded',
  missing: 'Not recorded',
  problems: 'Worth a listen',
  undecided: 'Still to pick',
  picked: 'Picked',
}

interface ReviewState {
  clips: Clip[]
  prepared: { at: string } | null
  decisions: Decisions
}

export default function ReviewPage() {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null)
  const [state, setState] = useState<ReviewState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<string | null>(null)
  const [module, setModule] = useState('all')
  const [show, setShow] = useState<Show>('undecided')
  const [which, setWhich] = useState<PlayWhich>('prepared')
  const [exported, setExported] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadScript(), fetchReview()]).then(
      ([script, review]) => {
        if (cancelled) return
        setPhrases(script)
        setState(review)
      },
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Held steady while nothing has loaded, so the memos below don't re-run.
  const decisions = useMemo(() => state?.decisions ?? emptyDecisions(), [state])
  const clips = useMemo(() => state?.clips ?? [], [state])
  const rows = useMemo(() => (phrases && state ? buildRows(phrases, state.clips, state.decisions) : []), [phrases, state])
  const shown = useMemo(() => filterRows(rows, { module, show }), [rows, module, show])
  const modules = useMemo(() => {
    const seen = new Map<string, string>()
    for (const { phrase } of rows) seen.set(phrase.module, phrase.moduleTitle)
    return [...seen]
  }, [rows])
  const counts = useMemo(() => progress(rows), [rows])
  const voiceList = useMemo(() => voices(clips, rows, decisions), [clips, rows, decisions])
  // One player for the page, so starting a clip stops whatever was playing.
  const player = usePlayer()

  /**
   * Apply a decision here and send it to be saved. The page keeps the change
   * either way: a failed save leaves a warning up rather than quietly undoing
   * what you just decided, and clicking it again sends it again.
   */
  const decide = useCallback((patch: Patch) => {
    setState((was) => (was ? { ...was, decisions: applyPatch(was.decisions, patch) } : was))
    setExported(null)
    savePatch(patch).then(
      (decisions) => {
        setUnsaved(null)
        setState((was) => (was ? { ...was, decisions } : was))
      },
      (e: Error) => setUnsaved(e.message),
    )
  }, [])

  const exportPicks = useCallback(() => {
    setExported(null)
    postJson<{ file: string; picked: number }>('/recordings-api/export', buildExport(rows)).then(
      ({ file, picked }) => setExported(`Wrote ${picked} picks to ${file}`),
      (e: Error) => setUnsaved(e.message),
    )
  }, [rows])

  if (error) {
    return (
      <main style={styles.page}>
        <h1 style={styles.title}>Audio review</h1>
        <p style={styles.error}>Could not load the clips: {error}</p>
        <p style={styles.desc}>This page only works under <code>npm run dev</code>.</p>
      </main>
    )
  }
  if (!phrases || !state) {
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
          {counts.picked} of {counts.recorded} recorded phrases picked · {counts.undecided} still to listen to ·{' '}
          {counts.bad} marked bad · {clips.length} clips in <code>recordings/</code>
          {' · '}
          <code>npm run fetch:recordings</code> to update
        </p>
        <p style={styles.desc}>
          {state.prepared ? (
            <>
              Prepared copies made {new Date(state.prepared.at).toLocaleString()} ·{' '}
              <code>npm run prepare:recordings</code> after fetching more
            </>
          ) : (
            <>
              No prepared copies yet: run <code>npm run prepare:recordings</code> to trim and even out the levels,
              then reload.
            </>
          )}
        </p>
        {unsaved && <p style={styles.error}>Not saved: {unsaved}. Your last change is only in this page.</p>}
        <Voices voices={voiceList} onHide={(contributor, hidden) => decide({ type: 'hide', contributor, hidden })} />
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
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Listen to</span>
            <select
              value={which}
              onChange={(e) => setWhich(e.target.value as PlayWhich)}
              style={styles.select}
              disabled={!state.prepared}
            >
              <option value="prepared">Prepared clips</option>
              <option value="original">As recorded</option>
            </select>
          </label>
          <button onClick={exportPicks} style={styles.smallButton}>Export picks</button>
          <span style={styles.count}>{shown.length} shown</span>
        </div>
        {exported && <p style={styles.desc}>{exported}</p>}
      </header>

      {shown.length === 0 ? (
        <p style={styles.desc}>Nothing to show.</p>
      ) : (
        <ul style={styles.rows}>
          {shown.map((row) => (
            <PhraseRow
              key={phraseKey(row.phrase)}
              row={row}
              player={player}
              which={which}
              onDecide={decide}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

async function fetchReview(): Promise<ReviewState> {
  const res = await fetch('/recordings-api/review.json')
  if (!res.ok) throw new Error(`the dev server answered ${res.status}`)
  const body = await res.json()
  return { clips: (body.clips ?? []) as Clip[], prepared: body.prepared ?? null, decisions: parseDecisions(body.decisions) }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const answer = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(answer.error ?? `the dev server answered ${res.status}`)
  return answer as T
}

async function savePatch(patch: Patch): Promise<Decisions> {
  const { decisions } = await postJson<{ decisions: unknown }>('/recordings-api/decisions', patch)
  return parseDecisions(decisions)
}

function Voices({ voices, onHide }: { voices: Voice[]; onHide: (contributor: string, hidden: boolean) => void }) {
  if (voices.length === 0) return <p style={styles.desc}>No recordings yet.</p>
  return (
    <ul style={styles.voices}>
      {voices.map((v) => (
        <li key={v.contributor} style={{ ...styles.voice, ...(v.hidden ? styles.voiceHidden : null) }}>
          <div style={styles.voiceHead}>
            <strong>{v.contributor}</strong>
            <label style={styles.hide}>
              <input
                type="checkbox"
                checked={v.hidden}
                onChange={(e) => onHide(v.contributor, e.target.checked)}
                aria-label={`Hide ${v.contributor}`}
              />
              Hide
            </label>
          </div>
          <span style={styles.desc}>
            {v.clips} clip{v.clips === 1 ? '' : 's'} · {v.picked} picked · {v.bad} bad
          </span>
          <span style={styles.desc}>typical peak {v.medianPeakDb} dB · average {v.medianRmsDb} dB</span>
        </li>
      ))}
    </ul>
  )
}

const urlOf = (option: Option, which: PlayWhich) => (which === 'original' ? option.originalUrl : option.url)

function PhraseRow({
  row,
  player,
  which,
  onDecide,
}: {
  row: Row
  player: Player
  which: PlayWhich
  onDecide: (patch: Patch) => void
}) {
  const { playing, play, stop } = player
  const phrase = phraseKey(row.phrase)
  // The contenders: what is left once the bad takes are out.
  const urls = row.visible.filter((o) => !o.bad).map((o) => urlOf(o, which))
  const mine = playing !== null && urls.includes(playing)

  return (
    <li style={styles.row}>
      <div style={styles.rowHead}>
        <div>
          <div style={styles.phrase}>{row.phrase.text}</div>
          <div style={styles.desc}>
            {row.phrase.moduleTitle} · {row.phrase.file.replace(/\.wav$/, '')}
            {row.hidden > 0 && ` · ${row.hidden} hidden`}
            {row.pick && ` · picked: ${row.pick}`}
          </div>
        </div>
        {urls.length > 1 && (
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
        {row.visible.map((option) => (
          <OptionBox
            key={option.source}
            option={option}
            which={which}
            playing={playing === urlOf(option, which)}
            onPlay={() => (playing === urlOf(option, which) ? stop() : play([urlOf(option, which)]))}
            onPick={() => onDecide({ type: 'pick', phrase, source: option.picked ? null : option.source })}
            onBad={() => onDecide({ type: 'bad', phrase, source: option.source, bad: !option.bad })}
          />
        ))}
        {row.recorded === 0 && <span style={styles.desc}>No one has recorded this yet.</span>}
      </div>
    </li>
  )
}

function OptionBox({
  option,
  which,
  playing,
  onPlay,
  onPick,
  onBad,
}: {
  option: Option
  which: PlayWhich
  playing: boolean
  onPlay: () => void
  onPick: () => void
  onBad: () => void
}) {
  const { clip, picked, bad } = option
  const name = option.source === GENERATED ? 'Generated voice' : option.source
  const prepared = clip?.prepared
  const shown = which === 'original' ? clip : (prepared ?? clip)
  return (
    <div
      style={{
        ...styles.option,
        ...(bad ? styles.optionBad : null),
        ...(picked ? styles.optionPicked : null),
        ...(playing ? styles.optionPlaying : null),
      }}
    >
      <div style={styles.optionHead}>
        <button onClick={onPlay} style={styles.play} aria-label={`${playing ? 'Stop' : 'Play'} ${name}`}>
          {playing ? '■' : '▶'}
        </button>
        <div style={styles.optionName}>{name}</div>
        {picked && <span style={styles.badge}>Picked</span>}
      </div>
      {shown ? (
        <>
          <Level peakDb={shown.peakDb} rmsDb={shown.rmsDb} />
          <div style={styles.desc}>
            {(shown.durationMs / 1000).toFixed(1)}s · peak {shown.peakDb} dB · average {shown.rmsDb} dB
            {shown.leadMs > 400 && ` · ${(shown.leadMs / 1000).toFixed(1)}s before the words`}
            {shown.tailMs > 400 && ` · ${(shown.tailMs / 1000).toFixed(1)}s after`}
          </div>
          <div style={styles.desc}>
            {prepared
              ? `Prepared: ${prepared.gainDb > 0 ? '+' : ''}${prepared.gainDb} dB, ${prepared.cutLeadMs + prepared.cutTailMs}ms of silence off${prepared.note ? ` · ${prepared.note}` : ''}`
              : 'Not prepared yet'}
          </div>
        </>
      ) : (
        <div style={styles.desc}>Polly · what the app plays today</div>
      )}
      <div style={styles.warning}>{option.warnings.join(' · ')}</div>
      <div style={styles.actions}>
        <button
          onClick={onPick}
          aria-label={`Pick ${name}`}
          aria-pressed={picked}
          style={{ ...styles.action, ...(picked ? styles.actionOn : null) }}
        >
          {picked ? 'Picked ✓' : 'Pick'}
        </button>
        <button
          onClick={onBad}
          aria-label={`Mark ${name} bad`}
          aria-pressed={bad}
          style={{ ...styles.action, ...(bad ? styles.actionBad : null) }}
        >
          {bad ? 'Bad ✓' : 'Bad'}
        </button>
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
  warning: { fontSize: 12, color: 'var(--color-wrong)', fontWeight: 600, minHeight: 16 },
  voices: { listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 },
  voice: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, minWidth: 190, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', boxShadow: 'var(--shadow)' },
  voiceHidden: { opacity: 0.5 },
  voiceHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hide: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-muted)' },
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
  // One box per option, all the same size: a grid of equal columns, every box
  // filling its cell, so the levels and the buttons line up down the page.
  options: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, alignItems: 'stretch' },
  option: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 168, border: '2px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 10, background: '#fff' },
  optionPlaying: { background: '#f3f4f6' },
  optionPicked: { borderColor: 'var(--color-correct)', boxShadow: 'inset 0 0 0 1px var(--color-correct)' },
  optionBad: { borderStyle: 'dashed', opacity: 0.6 },
  optionHead: { display: 'flex', alignItems: 'center', gap: 10 },
  optionName: { fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  badge: { fontSize: 11, fontWeight: 700, color: 'var(--color-correct)', border: '1px solid var(--color-correct)', borderRadius: 'var(--radius-sm)', padding: '1px 6px' },
  play: { width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 13 },
  level: { position: 'relative', height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' },
  levelFill: { height: '100%', background: 'var(--color-correct)' },
  levelPeak: { position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--color-primary)' },
  actions: { display: 'flex', gap: 8, marginTop: 'auto' },
  action: { flex: 1, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '2px solid var(--color-border)', fontSize: 13, fontWeight: 600, background: '#fff' },
  actionOn: { borderColor: 'var(--color-correct)', background: 'var(--color-correct)', color: '#fff' },
  actionBad: { borderColor: 'var(--color-wrong)', background: 'var(--color-wrong)', color: '#fff' },
}
