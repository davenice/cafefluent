// Voice recorder (/#/record, not linked from the app). The speaker reads each
// phrase; two seconds of silence saves the clip and moves on. Clips are kept in
// the browser until the speaker downloads them as a zip and sends it to us.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { openMic, type Mic } from '../recorder/mic'
import { RecordingSession, measureNoise, type SessionEvent } from '../recorder/session'
import { DEFAULT_SETTINGS, type DetectorSettings } from '../recorder/detector'
import { encodeWav, peakDb, resample } from '../recorder/wav'
import { loadScript, phraseKey, clipWarnings, speakerOrder, type Phrase, type ClipInfo } from '../recorder/script'
import { createZip, type ZipEntry } from '../recorder/zip'
import { listClips, getClip, putClip, requestPersistentStorage } from '../recorder/clipStore'

type Stage = 'setup' | 'checking' | 'too-noisy' | 'recording' | 'review'

const NOISE_CHECK_MS = 3000
// The rate the app's mp3s use. Recording at the mic's rate (usually 48 kHz)
// would double the download size for no audible gain.
const SAVE_SAMPLE_RATE = 22050

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatDb(db: number): string {
  return `${Math.round(db)} dB`
}

/**
 * The next phrase without a recording: the one after `after` in the speaker's
 * order (or the first, if `after` is null), wrapping round.
 */
function nextUnrecorded(order: number[], phrases: Phrase[], recorded: Record<string, ClipInfo>, after: number | null): number | null {
  const start = after === null ? -1 : order.indexOf(after)
  for (let step = 1; step <= order.length; step++) {
    const i = order[(start + step) % order.length]
    if (!recorded[phraseKey(phrases[i])]) return i
  }
  return null
}

export default function RecordPage() {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [speakerName, setSpeakerName] = useState('')
  const [settings, setSettings] = useState<DetectorSettings>(DEFAULT_SETTINGS)
  const [stage, setStage] = useState<Stage>('setup')
  const [startError, setStartError] = useState<string | null>(null)
  const [floorDb, setFloorDb] = useState<number | null>(null)
  const [level, setLevel] = useState(-100)
  const [recorded, setRecorded] = useState<Record<string, ClipInfo>>({})
  const [index, setIndex] = useState(0)
  const [returnTo, setReturnTo] = useState<number | null>(null)
  const [lastRecorded, setLastRecorded] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [hearing, setHearing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)

  const micRef = useRef<Mic | null>(null)
  const sessionRef = useRef<RecordingSession | null>(null)
  const eventHandlerRef = useRef<(e: SessionEvent) => void>(() => {})
  const speaker = slug(speakerName)
  const order = phrases ? speakerOrder(phrases.length, speaker) : []
  const micAvailable = window.isSecureContext && !!navigator.mediaDevices

  useEffect(() => {
    loadScript().then(setPhrases).catch(() => setLoadError(true))
    return () => {
      sessionRef.current?.stop()
      micRef.current?.close()
    }
  }, [])

  async function start() {
    if (!phrases || !speaker) return
    setStartError(null)
    try {
      requestPersistentStorage()
      const existing = await listClips(speaker)
      const done = Object.fromEntries(existing.map((c) => [phraseKey(c), { durationMs: c.durationMs, peakDb: c.peakDb }]))
      setRecorded(done)
      micRef.current ??= await openMic()
      await checkNoise(done)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e))
    }
  }

  async function checkNoise(done: Record<string, ClipInfo> = recorded) {
    const mic = micRef.current
    if (!mic || !phrases) return
    sessionRef.current?.stop()
    sessionRef.current = null
    setStage('checking')
    const floor = await measureNoise(mic, NOISE_CHECK_MS, setLevel)
    setFloorDb(floor)
    if (floor > settings.quietLimitDb) {
      setStage('too-noisy')
      return
    }
    const session = new RecordingSession(mic, floor, settings, (e) => eventHandlerRef.current(e))
    sessionRef.current = session
    const first = nextUnrecorded(order, phrases, done, null)
    if (first === null) {
      setStage('review')
      return
    }
    setIndex(first)
    setReturnTo(null)
    setStage('recording')
    setPaused(false)
    setPauseReason(null)
    session.resume()
  }

  function pause(reason: string | null = null) {
    sessionRef.current?.pause()
    setPaused(true)
    setPauseReason(reason)
    setHearing(false)
  }

  function resume() {
    sessionRef.current?.resume()
    setPaused(false)
    setPauseReason(null)
  }

  /** Go back and record the phrase just done again, then return here. */
  function redoPrevious() {
    if (lastRecorded === null || lastRecorded === index) return
    sessionRef.current?.restartClip()
    setHearing(false)
    setReturnTo(returnTo ?? index)
    setIndex(lastRecorded)
  }

  function rerecord(i: number) {
    setReturnTo(null)
    setIndex(i)
    setStage('recording')
    resume()
  }

  function openReview() {
    pause()
    setStage('review')
  }

  async function saveClip(phrase: Phrase, samples: Float32Array, sampleRate: number) {
    try {
      const saved = await resample(samples, sampleRate, SAVE_SAMPLE_RATE)
      await putClip({
        speaker,
        module: phrase.module,
        file: phrase.file,
        wav: encodeWav(saved, SAVE_SAMPLE_RATE),
        durationMs: Math.round((saved.length / SAVE_SAMPLE_RATE) * 1000),
        peakDb: peakDb(saved),
      })
    } catch (e) {
      setSaveError(`Could not save “${phrase.text}”: ${e instanceof Error ? e.message : e}`)
      pause('A clip could not be saved. The device may be out of space. Download the zip, then press Resume.')
    }
  }

  function handleEvent(e: SessionEvent) {
    if (!phrases) return
    switch (e.type) {
      case 'level':
        if (stage === 'recording') setLevel(e.db)
        break
      case 'speech-start':
        setHearing(true)
        break
      case 'discard':
        setHearing(false)
        break
      case 'too-long':
        pause(`That went on for more than ${settings.maxClipMs / 1000} seconds. Is there background noise? Press Resume to try again.`)
        break
      case 'noisy':
        setPaused(true)
        setHearing(false)
        setPauseReason(`It got too noisy (${formatDb(e.ambientDb)}). Wait for quiet or move somewhere quieter, then press Resume.`)
        break
      case 'clip': {
        const phrase = phrases[index]
        const info = { durationMs: Math.round((e.samples.length / e.sampleRate) * 1000), peakDb: peakDb(e.samples) }
        const nowRecorded = { ...recorded, [phraseKey(phrase)]: info }
        setRecorded(nowRecorded)
        setLastRecorded(index)
        setHearing(false)
        saveClip(phrase, e.samples, e.sampleRate)
        const next = returnTo ?? nextUnrecorded(order, phrases, nowRecorded, index)
        setReturnTo(null)
        if (next === null) {
          openReview()
        } else {
          setIndex(next)
        }
        break
      }
    }
  }

  // The session calls back from the audio thread; always route to the latest handler.
  useEffect(() => {
    eventHandlerRef.current = handleEvent
  })

  useEffect(() => {
    if (stage !== 'recording') return
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ') {
        e.preventDefault()
        if (paused) resume()
        else pause()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        redoPrevious()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Everything recorded so far, plus a list of what each file says. */
  async function downloadZip() {
    if (!phrases) return
    setZipping(true)
    try {
      const stored = new Map((await listClips(speaker)).map((c) => [phraseKey(c), c]))
      // Only phrases still in the script, in script order.
      const clips = phrases.filter((p) => stored.has(phraseKey(p)))
      const entries: ZipEntry[] = clips.map((p) => ({
        name: `${speaker}/${p.module}/${p.file}`,
        data: new Uint8Array(stored.get(phraseKey(p))!.wav),
      }))
      const list = clips.map(({ module, file, text }) => ({ module, file, text }))
      entries.push({ name: `${speaker}/phrases.json`, data: new TextEncoder().encode(JSON.stringify(list, null, 2) + '\n') })

      const url = URL.createObjectURL(createZip(entries))
      const link = document.createElement('a')
      link.href = url
      link.download = `cafefluent-${speaker}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setSaveError(`Could not make the zip: ${e instanceof Error ? e.message : e}`)
    } finally {
      setZipping(false)
    }
  }

  async function play(phrase: Phrase) {
    const clip = await getClip(speaker, phrase.module, phrase.file)
    if (!clip) return
    const url = URL.createObjectURL(new Blob([clip.wav], { type: 'audio/wav' }))
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    audio.play()
  }

  const doneCount = phrases ? phrases.filter((p) => recorded[phraseKey(p)]).length : 0

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.heading}>Voice recorder</h1>
        <Link to="/" style={styles.homeLink}>Home</Link>
      </div>

      {!micAvailable && (
        <p style={styles.error}>
          The microphone only works on https or localhost. Locally, open http://localhost:5173/#/record on this computer.
        </p>
      )}
      {loadError && <p style={styles.error}>Could not load the module data.</p>}
      {saveError && <p style={styles.error}>{saveError}</p>}

      {stage === 'setup' && (
        <div style={styles.card}>
          <p>
            {phrases ? `${phrases.length} phrases to record.` : 'Loading phrases…'} Read each phrase out loud. When you stop
            talking for {settings.endSilenceMs / 1000} seconds, the clip is saved and the next phrase appears.
          </p>
          <ul style={styles.tips}>
            <li>Use a quiet room with soft furnishings.</li>
            <li>Keep the microphone about 20 cm from your mouth.</li>
            <li>Space pauses. Backspace records the last phrase again.</li>
          </ul>
          <label style={styles.field}>
            Speaker name
            <input
              style={styles.input}
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              placeholder="e.g. Sam"
            />
          </label>
          <div style={styles.notice}>
            <p>
              <strong>Your recordings are only saved in this browser.</strong> They are not sent anywhere until you
              download them.
            </p>
            <p>
              If you clear your browser data, or use a private or incognito window, you will lose anything you have not
              downloaded.
            </p>
            <p>Press “Download zip” before you finish your session, and send us the file.</p>
          </div>

          <details>
            <summary style={styles.muted}>Settings</summary>
            <div style={styles.settings}>
              <label style={styles.field}>
                Silence that ends a clip (seconds)
                <input
                  style={styles.input}
                  type="number"
                  step={0.25}
                  value={settings.endSilenceMs / 1000}
                  onChange={(e) => setSettings({ ...settings, endSilenceMs: Number(e.target.value) * 1000 })}
                />
              </label>
              <label style={styles.field}>
                Speech threshold (dB above background)
                <input
                  style={styles.input}
                  type="number"
                  value={settings.onsetDb}
                  onChange={(e) => setSettings({ ...settings, onsetDb: Number(e.target.value), releaseDb: Number(e.target.value) - 5 })}
                />
              </label>
              <label style={styles.field}>
                Quiet room limit (dBFS)
                <input
                  style={styles.input}
                  type="number"
                  value={settings.quietLimitDb}
                  onChange={(e) => setSettings({ ...settings, quietLimitDb: Number(e.target.value) })}
                />
              </label>
            </div>
          </details>

          {startError && <p style={styles.error}>{startError}</p>}
          <button style={styles.primaryBtn} disabled={!phrases || !speaker || !micAvailable} onClick={start}>
            Start
          </button>
        </div>
      )}

      {stage === 'checking' && (
        <div style={styles.card}>
          <p>Checking the room. Please stay quiet for {NOISE_CHECK_MS / 1000} seconds…</p>
          <LevelMeter db={level} limitDb={settings.quietLimitDb} />
        </div>
      )}

      {stage === 'too-noisy' && floorDb !== null && (
        <div style={styles.card}>
          <p style={styles.error}>
            The room is too noisy: {formatDb(floorDb)}. It needs to be below {formatDb(settings.quietLimitDb)}.
          </p>
          <p>Close doors and windows, turn off fans or music, or move somewhere quieter.</p>
          <button style={styles.primaryBtn} onClick={() => checkNoise()}>Check again</button>
        </div>
      )}

      {stage === 'recording' && phrases && (
        <>
          <Progress phrases={phrases} recorded={recorded} current={index} />
          <p style={styles.muted}>
            {doneCount} / {phrases.length} recorded · background {floorDb !== null && formatDb(floorDb)}
          </p>

          <div style={styles.phraseCard}>
            <p style={styles.muted}>
              {phrases[index].moduleTitle}
              {recorded[phraseKey(phrases[index])] && ' · recording again'}
            </p>
            <p style={styles.phrase}>{phrases[index].text}</p>
            <StatusLight paused={paused} hearing={hearing} />
          </div>

          {pauseReason && <p style={styles.error}>{pauseReason}</p>}
          <LevelMeter db={level} threshold={floorDb !== null ? floorDb + settings.onsetDb : undefined} />

          <div style={styles.buttons}>
            <button style={styles.primaryBtn} onClick={() => (paused ? resume() : pause())}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              style={styles.secondaryBtn}
              disabled={lastRecorded === null || lastRecorded === index}
              onClick={redoPrevious}
            >
              Record last phrase again
            </button>
            <button style={styles.secondaryBtn} onClick={openReview}>Review</button>
            <button style={styles.secondaryBtn} disabled={doneCount === 0 || zipping} onClick={downloadZip}>
              {zipping ? 'Making zip…' : `Download zip (${doneCount})`}
            </button>
          </div>
        </>
      )}

      {stage === 'review' && phrases && (
        <>
          <p>
            {doneCount} / {phrases.length} recorded.
          </p>
          <div style={styles.buttons}>
            {doneCount < phrases.length && (
              <button style={styles.primaryBtn} onClick={() => rerecord(nextUnrecorded(order, phrases, recorded, index) ?? 0)}>
                Continue recording
              </button>
            )}
            <button style={styles.secondaryBtn} disabled={doneCount === 0 || zipping} onClick={downloadZip}>
              {zipping ? 'Making zip…' : `Download zip (${doneCount})`}
            </button>
          </div>
          <ol style={styles.reviewList}>
            {phrases.map((p, i) => {
              const clip = recorded[phraseKey(p)]
              const warnings = clip ? clipWarnings(p, clip) : []
              return (
                <li key={phraseKey(p)} style={styles.reviewRow}>
                  <div style={styles.reviewText}>
                    <span>{p.text}</span>
                    <span style={styles.muted}>
                      {p.moduleTitle} · {clip ? `${(clip.durationMs / 1000).toFixed(1)} s` : 'not recorded'}
                    </span>
                    {warnings.map((w) => (
                      <span key={w} style={styles.warning}>{w}</span>
                    ))}
                  </div>
                  {clip && <button style={styles.smallBtn} onClick={() => play(p)}>Play</button>}
                  <button style={styles.smallBtn} onClick={() => rerecord(i)}>{clip ? 'Redo' : 'Record'}</button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}

function StatusLight({ paused, hearing }: { paused: boolean; hearing: boolean }) {
  const [color, label] = paused
    ? ['var(--color-muted)', 'Paused']
    : hearing
      ? ['var(--color-accent)', 'Recording…']
      : ['var(--color-correct)', 'Ready: read the phrase']
  return (
    <p style={styles.status}>
      <span style={{ ...styles.light, background: color }} />
      {label}
    </p>
  )
}

/** Level bar from −90 to 0 dBFS, with an optional marker line. */
function LevelMeter({ db, threshold, limitDb }: { db: number; threshold?: number; limitDb?: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v + 90) / 90) * 100))}%`
  const marker = threshold ?? limitDb
  return (
    <div style={styles.meter}>
      <div style={{ ...styles.meterFill, width: pct(db) }} />
      {marker !== undefined && <div style={{ ...styles.meterMarker, left: pct(marker) }} />}
      <span style={styles.meterLabel}>{formatDb(db)}</span>
    </div>
  )
}

/** One segment per module, sized by its phrase count and filled by what is recorded. */
function Progress({ phrases, recorded, current }: { phrases: Phrase[]; recorded: Record<string, ClipInfo>; current: number }) {
  const modules = [...new Set(phrases.map((p) => p.module))]
  return (
    <div style={styles.progress}>
      {modules.map((m) => {
        const inModule = phrases.filter((p) => p.module === m)
        const done = inModule.filter((p) => recorded[phraseKey(p)]).length
        const active = phrases[current].module === m
        return (
          <div
            key={m}
            title={`${inModule[0].moduleTitle}: ${done} / ${inModule.length}`}
            style={{ ...styles.progressSegment, flexGrow: inModule.length, outline: active ? '2px solid var(--color-primary)' : 'none' }}
          >
            <div style={{ ...styles.progressFill, width: `${(done / inModule.length) * 100}%` }} />
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  heading: { fontSize: 20, fontWeight: 700 },
  homeLink: { fontSize: 14, color: 'var(--color-muted)' },
  card: { background: 'var(--color-surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  tips: { paddingLeft: 20, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 },
  input: { padding: '8px 10px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' },
  settings: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  muted: { fontSize: 13, color: 'var(--color-muted)' },
  error: { fontSize: 14, color: 'var(--color-wrong)' },
  notice: { fontSize: 14, padding: 12, borderRadius: 'var(--radius-sm)', background: '#fff8e1', border: '1px solid #f0c36d', display: 'flex', flexDirection: 'column', gap: 6 },
  warning: { fontSize: 12, color: 'var(--color-wrong)', fontWeight: 600 },
  primaryBtn: { padding: '12px 20px', fontSize: 16, fontWeight: 600, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer' },
  secondaryBtn: { padding: '12px 20px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' },
  smallBtn: { padding: '6px 12px', fontSize: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer' },
  buttons: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  phraseCard: { background: 'var(--color-surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' },
  phrase: { fontSize: 32, fontWeight: 700, lineHeight: 1.25 },
  status: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 },
  light: { width: 14, height: 14, borderRadius: '50%', display: 'inline-block' },
  meter: { position: 'relative', height: 20, background: 'var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' },
  meterFill: { height: '100%', background: 'var(--color-correct)', transition: 'width 50ms linear' },
  meterMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--color-accent)' },
  meterLabel: { position: 'absolute', right: 8, top: 1, fontSize: 12, color: 'var(--color-text)' },
  progress: { display: 'flex', gap: 4, height: 12 },
  progressSegment: { flexBasis: 0, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden', outlineOffset: 1 },
  progressFill: { height: '100%', background: 'var(--color-correct)' },
  reviewList: { listStyle: 'decimal', paddingLeft: 28, display: 'flex', flexDirection: 'column', gap: 8 },
  reviewRow: { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' },
  reviewText: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
}
