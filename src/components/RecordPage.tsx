// Voice recorder for a contributor, opened from their personal link
// (record.html, via ContributorPage). They read each phrase; two seconds of
// silence saves the clip and moves on. Each clip is saved in the browser, then
// sent to the server from there (see uploader.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import { openMic, type Mic } from '../recorder/mic'
import { RecordingSession, measureNoise, SILENT_MIC_MS, WATCHDOG_INTERVAL_MS, type SessionEvent } from '../recorder/session'
import { DEFAULT_SETTINGS, type DetectorSettings } from '../recorder/detector'
import { encodeWav, peakDb, resample } from '../recorder/wav'
import { loadScript, phraseKey, clipWarnings, recordingOrder, type Phrase, type ClipInfo } from '../recorder/script'
import { listClips, getClip, putClip, pendingClips, markUploaded, requestPersistentStorage } from '../recorder/clipStore'
import { Uploader, type UploadStatus } from '../recorder/uploader'
import type { Me, RecordingsApi } from '../recorder/api'
import NumberField from './NumberField'

/** Someone recording from their personal link. */
export interface Contributor {
  me: Me
  api: RecordingsApi
}

type Stage = 'setup' | 'checking' | 'too-noisy' | 'recording' | 'review' | 'finished'

const NOISE_CHECK_MS = 3000
// Recording in a room that failed the check: how far above its background the
// limit moves, so ordinary ups and downs in the noise don't pause every clip.
const NOISY_ROOM_MARGIN_DB = 6
// Leaving the page stops the audio: the browser suspends the audio context
// while the page is in the background, and the device may give the microphone
// to another app. Nothing tells the page, and a stopped microphone looks just
// like a quiet room, so say what happened and open it again on the next tap.
const MIC_STOPPED_PAUSED = 'The microphone stopped. This happens when the page is left for a while. Press Resume to turn it on again.'
const MIC_STOPPED_SETUP = 'The microphone stopped. Press Start to try again.'

// The rate the app's mp3s use. Recording at the mic's rate (usually 48 kHz)
// would double the download size for no audible gain.
const SAVE_SAMPLE_RATE = 22050

// A clip on the server but not in this browser: recorded on another device, or
// before the browser's storage was cleared. It counts as done, but there is
// nothing here to play.
const SAVED_ELSEWHERE: ClipInfo = { durationMs: NaN, peakDb: NaN }

function formatDb(db: number): string {
  return `${Math.round(db)} dB`
}

/**
 * The next phrase without a recording: the one after `after` in the speaker's
 * order (or the first, if `after` is null), wrapping round.
 */
/** Phrase indexes for the review list: the recorded ones first, each group in script order. */
function reviewOrder(phrases: Phrase[], recorded: Record<string, ClipInfo>): number[] {
  const indexes = phrases.map((_, i) => i)
  return [...indexes.filter((i) => recorded[phraseKey(phrases[i])]), ...indexes.filter((i) => !recorded[phraseKey(phrases[i])])]
}

function nextUnrecorded(order: number[], phrases: Phrase[], recorded: Record<string, ClipInfo>, after: number | null): number | null {
  const start = after === null ? -1 : order.indexOf(after)
  for (let step = 1; step <= order.length; step++) {
    const i = order[(start + step) % order.length]
    if (!recorded[phraseKey(phrases[i])]) return i
  }
  return null
}

export default function RecordPage({ contributor }: { contributor: Contributor }) {
  const [phrases, setPhrases] = useState<Phrase[] | null>(null)
  const [loadError, setLoadError] = useState(false)
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
  const [upload, setUpload] = useState<UploadStatus | null>(null)

  const micRef = useRef<Mic | null>(null)
  const sessionRef = useRef<RecordingSession | null>(null)
  const eventHandlerRef = useRef<(e: SessionEvent) => void>(() => {})
  const uploaderRef = useRef<Uploader | null>(null)
  const uploadStatusRef = useRef<(s: UploadStatus) => void>(() => {})
  const pauseRef = useRef<(reason?: string | null) => void>(() => {})
  const lastFrameRef = useRef(0)
  const speaker = contributor.me.id
  const [recordedByOthers, setRecordedByOthers] = useState(contributor.me.recordedByOthers ?? {})
  const order = useMemo(
    () => (phrases ? recordingOrder(phrases, speaker, recordedByOthers) : []),
    [phrases, speaker, recordedByOthers],
  )
  const micAvailable = window.isSecureContext && !!navigator.mediaDevices

  useEffect(() => {
    loadScript().then(setPhrases).catch(() => setLoadError(true))
    return () => {
      sessionRef.current?.stop()
      micRef.current?.close()
    }
  }, [])

  // Send anything left from an earlier visit, then each clip as it is saved, and
  // everything waiting whenever the browser comes back online.
  useEffect(() => {
    const uploader = new Uploader(
      { pending: () => pendingClips(contributor.me.id), markUploaded },
      contributor.api,
      (s) => uploadStatusRef.current(s),
    )
    uploaderRef.current = uploader
    uploader.flush()
    const onOnline = () => uploader.flush()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      uploader.stop()
    }
  }, [contributor])

  // Clips not yet sent are safe in the browser and go on the next visit, but
  // the contributor may not come back.
  const unsent = upload !== null && upload.pending > 0 && upload.state !== 'revoked'
  useEffect(() => {
    if (!unsent) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsent])

  async function start() {
    if (!phrases || !speaker) return
    setStartError(null)
    try {
      requestPersistentStorage()
      // What is on the server now, including what other people have recorded
      // since the page opened. Fetched while the microphone opens, not before:
      // Safari only lets audio start soon after the tap. Offline, the counts
      // from when the page opened will do.
      const latest = contributor.api.me().catch(() => contributor.me)
      // An earlier visit's microphone may have been stopped since; opening it
      // again needs a tap, which is this one.
      if (micRef.current) await micRef.current.revive()
      else micRef.current = await openMic()
      const [existing, me] = await Promise.all([listClips(speaker), latest])
      const done: Record<string, ClipInfo> = Object.fromEntries(
        existing.map((c) => [phraseKey(c), { durationMs: c.durationMs, peakDb: c.peakDb }]),
      )
      for (const c of me.clips) done[phraseKey(c)] ??= SAVED_ELSEWHERE
      const others = me.recordedByOthers ?? {}
      setRecorded(done)
      setRecordedByOthers(others)
      await checkNoise(done, recordingOrder(phrases, speaker, others))
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e))
    }
  }

  // `done` and `phraseOrder` are passed in from start(), whose state updates
  // haven't reached this render yet.
  async function checkNoise(done: Record<string, ClipInfo> = recorded, phraseOrder: number[] = order) {
    const mic = micRef.current
    if (!mic || !phrases) return
    sessionRef.current?.stop()
    sessionRef.current = null
    setStage('checking')
    let floor: number
    try {
      floor = await measureNoise(mic, NOISE_CHECK_MS, setLevel)
    } catch {
      setStage('setup')
      setStartError(MIC_STOPPED_SETUP)
      return
    }
    setFloorDb(floor)
    if (floor > settings.quietLimitDb) {
      setStage('too-noisy')
      return
    }
    startSession(floor, settings, done, phraseOrder)
  }

  /** Record in a room that failed the check. The clips may have more background noise. */
  function recordAnyway() {
    if (floorDb === null) return
    startSession(floorDb, { ...settings, quietLimitDb: Math.max(settings.quietLimitDb, floorDb + NOISY_ROOM_MARGIN_DB) })
  }

  function startSession(
    floor: number,
    sessionSettings: DetectorSettings,
    done: Record<string, ClipInfo> = recorded,
    phraseOrder: number[] = order,
  ) {
    const mic = micRef.current
    if (!mic || !phrases) return
    const session = new RecordingSession(mic, floor, sessionSettings, (e) => eventHandlerRef.current(e))
    sessionRef.current = session
    const first = nextUnrecorded(phraseOrder, phrases, done, null)
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

  async function resume() {
    setPauseReason(null)
    try {
      await micRef.current?.revive()
    } catch (e) {
      setPauseReason(
        `The microphone could not start again: ${e instanceof Error ? e.message : e}. Check that nothing else is using it, then press Resume.`,
      )
      return
    }
    sessionRef.current?.resume()
    setPaused(false)
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

  /** Stop for today: let go of the microphone and say how to carry on later. */
  function finish() {
    sessionRef.current?.stop()
    sessionRef.current = null
    micRef.current?.close()
    micRef.current = null
    setPaused(false)
    setPauseReason(null)
    setHearing(false)
    setStage('finished')
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
        recordedAt: Date.now(),
      })
      uploaderRef.current?.flush()
    } catch (e) {
      setSaveError(`Could not save “${phrase.text}”: ${e instanceof Error ? e.message : e}`)
      pause('A clip could not be saved. The device may be out of space. Press Resume to try again.')
    }
  }

  function handleUploadStatus(s: UploadStatus) {
    setUpload(s)
    if (s.state === 'revoked' && stage === 'recording') {
      pause('This link has stopped working, so your recordings can’t be sent. Ask the person who sent it for a new one.')
    }
  }

  function handleEvent(e: SessionEvent) {
    if (!phrases) return
    switch (e.type) {
      case 'level':
        lastFrameRef.current = Date.now()
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
    uploadStatusRef.current = handleUploadStatus
    pauseRef.current = pause
  })

  // Stop while the page is in the background rather than record into nothing,
  // and on the way back say if the microphone needs turning on again.
  useEffect(() => {
    if (stage !== 'recording') return
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (!paused) pause()
      } else if (!pauseReason && !micRef.current?.isLive()) {
        // Only when there is nothing more important to say: a revoked link or a
        // noisy room still needs the microphone opening again, but Resume does
        // that anyway.
        setPauseReason(MIC_STOPPED_PAUSED)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  // Backgrounding isn't the only way the audio stops: a call or another app can
  // take the microphone while the page is open.
  useEffect(() => {
    if (stage !== 'recording' || paused) return
    // Frames take a moment to start, here and after every Resume.
    lastFrameRef.current = Date.now()
    const watchdog = setInterval(() => {
      const mic = micRef.current
      if (!mic) return
      if (mic.isLive() && Date.now() - lastFrameRef.current < SILENT_MIC_MS) return
      pauseRef.current(MIC_STOPPED_PAUSED)
    }, WATCHDOG_INTERVAL_MS)
    return () => clearInterval(watchdog)
  }, [stage, paused])

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
      <h1 style={styles.heading}>Voice recorder</h1>

      {!micAvailable && (
        <p style={styles.error}>
          The microphone can’t be used on this page. Open your link in Chrome, Safari or Firefox.
        </p>
      )}
      {loadError && <p style={styles.error}>Could not load the module data.</p>}
      {saveError && <p style={styles.error}>{saveError}</p>}
      {stage !== 'setup' && <UploadLine status={upload} />}

      {stage === 'setup' && (
        <div style={styles.card}>
          <p>Hello, {contributor.me.name}.</p>
          <p>
            {phrases ? `${phrases.length} phrases to record.` : 'Loading phrases…'} Read each phrase out loud. When you stop
            talking for {settings.endSilenceMs / 1000} seconds, the clip is saved and the next phrase appears.
          </p>
          <ul style={styles.tips}>
            <li>Use a quiet room with soft furnishings.</li>
            <li>Keep the microphone about 20 cm from your mouth.</li>
            <li>Space pauses. Backspace records the last phrase again.</li>
          </ul>
          <div style={styles.notice}>
            <p>
              <strong>Each recording is sent to us as soon as you make it.</strong> You don’t need to send us
              anything.
            </p>
            <p>You can stop at any time. Open your link again to carry on where you stopped, on any device.</p>
          </div>

          <details>
            <summary style={styles.muted}>Settings</summary>
            <div style={styles.settings}>
              <NumberField
                label="Silence that ends a clip (seconds)"
                value={settings.endSilenceMs / 1000}
                min={0.5}
                max={5}
                onChange={(n) => setSettings({ ...settings, endSilenceMs: n * 1000 })}
                style={fieldStyles}
              />
              <NumberField
                label="Speech threshold (dB above background)"
                value={settings.onsetDb}
                min={6}
                max={40}
                onChange={(n) => setSettings({ ...settings, onsetDb: n, releaseDb: n - 5 })}
                style={fieldStyles}
              />
              {/* Shown as a positive number: phone number pads have no minus key. */}
              <NumberField
                label="Quiet room limit (dB below full volume)"
                hint={`${-settings.quietLimitDb} means the background must be quieter than ${formatDb(settings.quietLimitDb)}. A lower number lets in a noisier room.`}
                value={-settings.quietLimitDb}
                min={20}
                max={70}
                onChange={(n) => setSettings({ ...settings, quietLimitDb: -n })}
                style={fieldStyles}
              />
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
          <div style={styles.buttons}>
            <button style={styles.primaryBtn} onClick={() => checkNoise()}>Check again</button>
            <button style={styles.secondaryBtn} onClick={recordAnyway}>Record anyway</button>
          </div>
          <p style={styles.muted}>If you record anyway, we may hear the background noise in your recordings.</p>
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
          {paused && !pauseReason && (
            <p style={styles.pausedHint}>
              Paused. Press <strong>Resume</strong> when you are ready. If you have finished for today, press{' '}
              <strong>Finish for now</strong>.
            </p>
          )}
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
            <button style={styles.secondaryBtn} onClick={finish}>Finish for now</button>
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
            <button style={styles.secondaryBtn} onClick={finish}>Finish for now</button>
          </div>
          <ol style={styles.reviewList}>
            {reviewOrder(phrases, recorded).map((i) => {
              const p = phrases[i]
              const clip = recorded[phraseKey(p)]
              const here = clip && clip !== SAVED_ELSEWHERE
              const warnings = here ? clipWarnings(p, clip) : []
              return (
                <li key={phraseKey(p)} style={styles.reviewRow}>
                  <div style={styles.reviewText}>
                    <span>{p.text}</span>
                    <span style={styles.muted}>
                      {p.moduleTitle} · {here ? `${(clip.durationMs / 1000).toFixed(1)} s` : clip ? 'saved earlier' : 'not recorded'}
                    </span>
                    {warnings.map((w) => (
                      <span key={w} style={styles.warning}>{w}</span>
                    ))}
                  </div>
                  {here && <button style={styles.smallBtn} onClick={() => play(p)}>Play</button>}
                  <button style={styles.smallBtn} onClick={() => rerecord(i)}>{clip ? 'Redo' : 'Record'}</button>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {stage === 'finished' && phrases && (
        <div style={styles.card}>
          <p style={styles.finishedTitle}>Thank you, {contributor.me.name}!</p>
          <p>
            {doneCount === phrases.length
              ? 'You have recorded every phrase.'
              : `You have recorded ${doneCount} of ${phrases.length} phrases.`}
          </p>
          {unsent && <p><strong>Keep this page open until it says “All recordings sent”.</strong></p>}
          {doneCount < phrases.length && (
            <div style={styles.notice}>
              <p>
                <strong>To record more another time, open your link again.</strong> It works on any device. You will
                start where you stopped.
              </p>
              <p>Add this page to your bookmarks so you can find it again.</p>
            </div>
          )}
          {doneCount < phrases.length && (
            <button style={styles.primaryBtn} onClick={start}>Record more now</button>
          )}
        </div>
      )}
    </div>
  )
}

/** How sending to the server is going. */
function UploadLine({ status }: { status: UploadStatus | null }) {
  if (!status) return null
  const clips = (n: number) => `${n} recording${n === 1 ? '' : 's'}`
  switch (status.state) {
    case 'revoked':
      return <p style={styles.error}>This link has stopped working. Ask the person who sent it for a new one.</p>
    case 'waiting':
      return (
        <p style={styles.error}>
          No connection. {clips(status.pending)} saved on this device will be sent when the connection is back. Keep this
          page open.
        </p>
      )
    case 'sending':
      return <p style={styles.muted}>Sending {clips(status.pending)}…</p>
    case 'idle':
      return status.failed > 0 ? (
        <p style={styles.error}>
          {clips(status.failed)} could not be sent. Open Review and press Redo on any you recorded just now.
        </p>
      ) : (
        <p style={styles.muted}>All recordings sent.</p>
      )
  }
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
  heading: { fontSize: 20, fontWeight: 700 },
  card: { background: 'var(--color-surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  tips: { paddingLeft: 20, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 },
  input: { padding: '8px 10px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' },
  settings: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  hint: { fontSize: 12, color: 'var(--color-muted)' },
  pausedHint: { fontSize: 15, padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' },
  finishedTitle: { fontSize: 20, fontWeight: 700 },
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

const fieldStyles = { field: styles.field, input: styles.input, hint: styles.hint }
