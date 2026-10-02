// Recorded clips, kept in the browser (IndexedDB) until the speaker downloads
// them as a zip. Survives reloads, so a session can be paused and resumed.

import type { ClipInfo } from './script'

export interface StoredClip extends ClipInfo {
  speaker: string
  module: string
  file: string
  wav: ArrayBuffer
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

export async function putClip(clip: StoredClip): Promise<void> {
  await run('readwrite', (s) => s.put(clip, `${clip.speaker}/${clip.module}/${clip.file}`))
}

/** Ask the browser not to clear our storage when space runs low. Best effort. */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {})
}
