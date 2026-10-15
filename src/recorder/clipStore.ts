// Recorded clips, kept in the browser (IndexedDB). Survives reloads, so a session
// can be paused and resumed. A speaker without a link downloads them as a zip; a
// contributor's are sent to the server, and this is the outbox they wait in.

import type { ClipInfo } from './script'

export interface StoredClip extends ClipInfo {
  speaker: string
  module: string
  file: string
  wav: ArrayBuffer
  /** When this take was recorded (ms since 1970). Tells a take apart from the one that replaced it. */
  recordedAt: number
  /** Saved on the server. Only contributor clips are ever sent. */
  uploaded?: boolean
}

const DB_NAME = 'cafefluent-recordings'
const STORE = 'clips'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode)
  const req = op(tx.objectStore(STORE))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'))
  })
}

// Keys are "<speaker>/<module>/<file>", so one speaker's clips are a key range.
const speakerRange = (speaker: string) => IDBKeyRange.bound(`${speaker}/`, `${speaker}/￿`)

export function listClips(speaker: string): Promise<StoredClip[]> {
  return run('readonly', (s) => s.getAll(speakerRange(speaker)) as IDBRequest<StoredClip[]>)
}

export function getClip(speaker: string, module: string, file: string): Promise<StoredClip | undefined> {
  return run('readonly', (s) => s.get(`${speaker}/${module}/${file}`) as IDBRequest<StoredClip | undefined>)
}

const clipKey = (c: { speaker: string; module: string; file: string }) => `${c.speaker}/${c.module}/${c.file}`

export async function putClip(clip: StoredClip): Promise<void> {
  await run('readwrite', (s) => s.put(clip, clipKey(clip)))
}

/** Clips recorded but not yet on the server. */
export async function pendingClips(speaker: string): Promise<StoredClip[]> {
  return (await listClips(speaker)).filter((c) => !c.uploaded)
}

/**
 * Note that a clip is on the server. If it was recorded again while it was being
 * sent, the new take is left alone, so it still gets sent.
 */
export async function markUploaded(clip: StoredClip): Promise<void> {
  const tx = (await db()).transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const req = store.get(clipKey(clip)) as IDBRequest<StoredClip | undefined>
  req.onsuccess = () => {
    if (req.result?.recordedAt === clip.recordedAt) store.put({ ...req.result, uploaded: true }, clipKey(clip))
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'))
  })
}

/** Ask the browser not to clear our storage when space runs low. Best effort. */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {})
}
