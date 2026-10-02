import { SegmentDetector, DEFAULT_SETTINGS, levelDb, noiseFloorDb, type DetectorEvent } from './detector'

const FRAME_MS = 20
const FLOOR = -60
const QUIET = -60
const SPEECH = -30

/** Feed `ms` worth of frames at one level; return the events that weren't 'none'. */
function feed(d: SegmentDetector, db: number, ms: number): DetectorEvent[] {
  const events: DetectorEvent[] = []
  for (let i = 0; i < ms / FRAME_MS; i++) {
    const e = d.push(db)
    if (e.type !== 'none') events.push(e)
  }
  return events
}

describe('SegmentDetector', () => {
  it('cuts one clip per utterance, with pre-roll and tail', () => {
    const d = new SegmentDetector(FLOOR, FRAME_MS)
    expect(feed(d, QUIET, 1000)).toEqual([])                  // frames 0–49
    expect(feed(d, SPEECH, 800)).toEqual([{ type: 'speech-start' }]) // frames 50–89
    const events = feed(d, QUIET, 2000)
    expect(events).toEqual([{ type: 'clip', startFrame: 50 - 15, endFrame: 89 + 15 }])
  })

  it('keeps going through a short pause, like the one at a comma', () => {
    const d = new SegmentDetector(FLOOR, FRAME_MS)
    feed(d, SPEECH, 500)
    expect(feed(d, QUIET, 600)).toEqual([])
    expect(feed(d, SPEECH, 500)).toEqual([])
    expect(feed(d, QUIET, 2000)).toMatchObject([{ type: 'clip' }])
  })

  it('ignores a click shorter than the onset time', () => {
    const d = new SegmentDetector(FLOOR, FRAME_MS)
    expect(feed(d, SPEECH, 40)).toEqual([])
    expect(feed(d, QUIET, 3000)).toEqual([])
  })

  it('discards a cough too short to be speech', () => {
    const d = new SegmentDetector(FLOOR, FRAME_MS)
    expect(feed(d, SPEECH, 100)).toEqual([{ type: 'speech-start' }])
    expect(feed(d, QUIET, 2000)).toEqual([{ type: 'discard' }])
  })

  it('reports a clip that never ends as too long', () => {
    const d = new SegmentDetector(FLOOR, FRAME_MS)
    const events = feed(d, SPEECH, DEFAULT_SETTINGS.maxClipMs + 200)
    expect(events.slice(0, 2)).toEqual([{ type: 'speech-start' }, { type: 'too-long' }])
  })

  it('reports when the background rises above the quiet limit', () => {
    // The room started at −50; now it is at −38: over the −40 limit but under the
    // −35 speech threshold, so it is not taken for speech.
    const d = new SegmentDetector(-50, FRAME_MS)
    const events = feed(d, -38, 3000)
    expect(events[0]).toMatchObject({ type: 'noisy' })
  })

  it('drops a clip in progress on reset', () => {
    const d = new SegmentDetector(FLOOR, FRAME_MS)
    feed(d, SPEECH, 500)
    d.reset()
    expect(d.isSpeaking).toBe(false)
    expect(feed(d, QUIET, 2000)).toEqual([])
  })
})

describe('levels', () => {
  it('measures a full-scale square wave as 0 dBFS', () => {
    expect(levelDb(new Float32Array(100).fill(1))).toBeCloseTo(0)
  })

  it('averages noise by power, so a loud moment counts for more than a quiet one', () => {
    expect(noiseFloorDb([-60, -60])).toBeCloseTo(-60)
    expect(noiseFloorDb([-60, -40])).toBeGreaterThan(-50)
  })
})
