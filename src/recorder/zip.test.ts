import { createZip, crc32 } from './zip'

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('createZip', () => {
  it('stores each file after its local header, followed by the central directory', async () => {
    const data = new TextEncoder().encode('hello')
    const zip = new Uint8Array(await createZip([{ name: 'a/b.txt', data }]).arrayBuffer())
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(new TextDecoder().decode(zip.slice(30, 37))).toBe('a/b.txt')
    expect(new TextDecoder().decode(zip.slice(37, 42))).toBe('hello')
    expect(view.getUint32(42, true)).toBe(0x02014b50)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(1)
  })
})
