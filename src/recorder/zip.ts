// Minimal zip writer. Files are stored, not compressed: WAV audio barely
// shrinks with deflate, and storing keeps this small enough to own.

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Date and time in the two 16-bit MS-DOS fields that zip uses. */
function dosDateTime(date: Date): [number, number] {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return [time, day]
}

export function createZip(entries: ZipEntry[], date = new Date()): Blob {
  const encoder = new TextEncoder()
  const [time, day] = dosDateTime(date)
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Fields shared by the local header and the central directory record, from "version needed" on.
    const common = (view: DataView, at: number) => {
      view.setUint16(at, 20, true)        // version needed
      view.setUint16(at + 2, 0x0800, true) // flags: UTF-8 names
      view.setUint16(at + 4, 0, true)     // method: stored
      view.setUint16(at + 6, time, true)
      view.setUint16(at + 8, day, true)
      view.setUint32(at + 10, crc, true)
      view.setUint32(at + 14, size, true)  // compressed size
      view.setUint32(at + 18, size, true)  // uncompressed size
      view.setUint16(at + 22, name.length, true)
      view.setUint16(at + 24, 0, true)     // extra field length
    }

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    common(lv, 4)
    local.set(name, 30)
    parts.push(local, entry.data)

    const record = new Uint8Array(46 + name.length)
    const cv = new DataView(record.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)             // version made by
    common(cv, 6)
    // comment length, disk number, internal and external attributes are all 0
    cv.setUint32(42, offset, true)
    record.set(name, 46)
    central.push(record)

    offset += local.length + size
  }

  const centralSize = central.reduce((n, r) => n + r.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' })
}
