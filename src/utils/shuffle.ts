export function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function pickRandom<T>(array: T[], n: number, exclude?: T): T[] {
  const pool = exclude !== undefined ? array.filter((x) => x !== exclude) : array
  return shuffle(pool).slice(0, n)
}
