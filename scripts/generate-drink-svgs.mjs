#!/usr/bin/env node
/**
 * Generate the coffee-drink cup illustrations for the coffee-drinks module.
 *
 * Usage:
 *   node scripts/generate-drink-svgs.mjs
 *
 * Output:
 *   public/content/coffee-drinks/images/<id>.svg   one per drink
 *   public/content/coffee-drinks/images/key.svg    the key to the fills
 *
 * Each drink is drawn as a cross-section of a cup: the layers are stacked
 * bottom-to-top in the order they are poured, using the same five fills as the
 * printed key (hatching = espresso, white = steamed milk, dots = foam, solid =
 * chocolate powder, waves = water).
 *
 * Cup sizes are drawn to scale on a shared baseline, so a small cup really does
 * look small next to a large one — that size difference is itself a cue
 * (espresso and macchiato are served short).
 *
 * `layers` runs bottom-to-top and the numbers are relative shares of the cup, so
 * they only need to be in proportion to each other. Every cup is filled to the
 * brim: a gap at the top reads as a half-empty cup rather than as a drink.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'content', 'coffee-drinks', 'images')

const DRINKS = [
  { id: 'cappuccino', cup: 'large',  layers: [['espresso', 25], ['milk', 30], ['foam', 45]] },
  { id: 'americano',  cup: 'large',  layers: [['espresso', 50], ['water', 50]] },
  { id: 'espresso',   cup: 'small',  layers: [['espresso', 100]] },
  { id: 'macchiato',  cup: 'small',  layers: [['espresso', 62], ['foam', 38]] },
  { id: 'flat-white', cup: 'medium', layers: [['espresso', 45], ['milk', 42], ['foam', 13]] },
  { id: 'cortado',    cup: 'medium', layers: [['espresso', 50], ['milk', 50]] },
  { id: 'long-black', cup: 'large',  layers: [['water', 45], ['espresso', 55]] },
  { id: 'mocha',      cup: 'large',  layers: [['espresso', 30], ['chocolate', 12], ['milk', 58]] },
  { id: 'latte',      cup: 'large',  layers: [['espresso', 20], ['milk', 68], ['foam', 12]] },
]

const W = 300
const H = 200
const INK = '#2b2b2b'
const CX = 137          // cup centre — leaves room for the handle on the right
const CUP_BOTTOM = 162  // every cup stands on the same line
const SAUCER_H = 26

const CUPS = {
  small:  { topW: 100, botW: 80,  h: 64,  handle: 32, stroke: 4.5 },
  medium: { topW: 142, botW: 114, h: 92,  handle: 42, stroke: 5 },
  large:  { topW: 178, botW: 144, h: 118, handle: 50, stroke: 5.5 },
}

// Tiles are kept shallow and their marks sit near the top of the tile, so that a band
// anchored to its own top edge starts drawing immediately rather than after a blank row.
const PATTERNS = {
  espresso: {
    w: 9, h: 9,
    marks: `<path d="M-2 2 L2 -2 M-1 10 L10 -1 M7 11 L11 7" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  foam: {
    w: 12, h: 12,
    marks: `<circle cx="3" cy="3" r="1.8" fill="${INK}"/><circle cx="9" cy="9" r="1.8" fill="${INK}"/>`,
  },
  water: {
    w: 18, h: 7,
    marks: `<path d="M0 3 q4.5 -2.5 9 0 t9 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
}

const SOLIDS = { milk: '#ffffff', chocolate: INK }

const r2 = (n) => Math.round(n * 100) / 100

/**
 * The paint for one band, plus the pattern it needs. The pattern tile is anchored to the
 * top of the band it fills, so every band's marks meet its top edge cleanly — otherwise
 * the tile phase can leave a strip of white below the surface and the drink looks short.
 */
function bandFill(kind, id, top) {
  if (SOLIDS[kind]) return { paint: SOLIDS[kind], def: '' }
  const { w, h, marks } = PATTERNS[kind]
  return {
    paint: `url(#${id})`,
    def: `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="${r2(top)}" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#fff"/>
      ${marks}
    </pattern>`,
  }
}

/**
 * The outline of the cup: straight tapered sides, rounded bottom corners. Callers close
 * it with `Z`, which draws the rim — the line the drink's surface sits against. Without
 * it a cup of white steamed milk is indistinguishable from an empty one.
 */
function cupPath({ topW, botW, h }) {
  const topY = CUP_BOTTOM - h
  const tx0 = CX - topW / 2, tx1 = CX + topW / 2
  const bx0 = CX - botW / 2, bx1 = CX + botW / 2
  const radius = 14
  // Walk back up each slanted side by `radius` so the corner curve starts on the slant.
  const run = (topW - botW) / 2
  const len = Math.hypot(run, h)
  const t = 1 - radius / len
  const lx = tx0 + (bx0 - tx0) * t, ly = topY + h * t
  const rx = tx1 + (bx1 - tx1) * t, ry = topY + h * t
  return [
    `M ${r2(tx0)} ${r2(topY)}`,
    `L ${r2(lx)} ${r2(ly)}`,
    `Q ${r2(bx0)} ${CUP_BOTTOM} ${r2(bx0 + radius)} ${CUP_BOTTOM}`,
    `L ${r2(bx1 - radius)} ${CUP_BOTTOM}`,
    `Q ${r2(bx1)} ${CUP_BOTTOM} ${r2(rx)} ${r2(ry)}`,
    `L ${r2(tx1)} ${r2(topY)}`,
  ].join(' ')
}

function saucerPath({ topW }) {
  const halfW = topW / 2 + 34
  const x0 = CX - halfW, x1 = CX + halfW
  const y0 = CUP_BOTTOM, y1 = CUP_BOTTOM + SAUCER_H
  return [
    `M ${r2(x0)} ${y0}`,
    `L ${r2(x1)} ${y0}`,
    `L ${r2(x1 - 16)} ${r2(y1 - 8)}`,
    `Q ${r2(x1 - 22)} ${y1} ${r2(x1 - 34)} ${y1}`,
    `L ${r2(x0 + 34)} ${y1}`,
    `Q ${r2(x0 + 22)} ${y1} ${r2(x0 + 16)} ${r2(y1 - 8)}`,
    'Z',
  ].join(' ')
}

/** A hollow loop on the right of the cup — one fat dark stroke with a thinner white one on top. */
function handlePath({ topW, botW, h, handle }) {
  const topY = CUP_BOTTOM - h
  const xAt = (y) => (CX + topW / 2) + ((CX + botW / 2) - (CX + topW / 2)) * ((y - topY) / h)
  const ay = topY + h * 0.14, by = topY + h * 0.70
  // Start inside the cup so the flat ends are hidden behind the fill and outline.
  const ax = xAt(ay) - 10, bx = xAt(by) - 10
  return `M ${r2(ax)} ${r2(ay)} C ${r2(ax + handle * 1.25)} ${r2(ay - 4)} ${r2(bx + handle * 1.25)} ${r2(by + 6)} ${r2(bx)} ${r2(by)}`
}

function drink({ cup, layers }) {
  const dims = CUPS[cup]
  const { h, stroke } = dims
  const body = cupPath(dims)
  const handle = handlePath(dims)
  const total = layers.reduce((sum, [, share]) => sum + share, 0)

  const defs = []
  const bands = []
  const seams = []
  let y = CUP_BOTTOM
  layers.forEach(([kind, share], i) => {
    const top = y - (h * share) / total
    const { paint, def } = bandFill(kind, `${kind}-${i}`, top)
    if (def) defs.push(def)
    bands.push(`<rect x="0" y="${r2(top)}" width="${W}" height="${r2(y - top)}" fill="${paint}"/>`)
    // A seam wherever two bands meet. The topmost boundary is the rim, which the cup
    // outline already draws, and the bottom is the base of the cup.
    if (y < CUP_BOTTOM) seams.push(`<line x1="0" y1="${r2(y)}" x2="${W}" y2="${r2(y)}" stroke="${INK}" stroke-width="2"/>`)
    y = top
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
  <defs>
    ${defs.join('\n    ')}
    <clipPath id="cup"><path d="${body} Z"/></clipPath>
  </defs>
  <path d="${saucerPath(dims)}" fill="#fff" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>
  <path d="${handle}" fill="none" stroke="${INK}" stroke-width="${r2(stroke * 3.4)}"/>
  <path d="${handle}" fill="none" stroke="#fff" stroke-width="${r2(stroke * 1.6)}"/>
  <g clip-path="url(#cup)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
    ${bands.join('\n    ')}
    ${seams.join('\n    ')}
  </g>
  <path d="${body} Z" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>
</svg>
`
}

/**
 * The key to the fills, drawn from the same patterns as the cups so the two can never
 * disagree. Without this the illustrations are just notation nobody has been taught.
 */
const KEY = [
  ['espresso', ['espresso']],
  ['milk', ['steamed', 'milk']],
  ['foam', ['foam']],
  ['chocolate', ['chocolate', 'powder']],
  ['water', ['water']],
]

function key() {
  const colW = 104
  const width = colW * KEY.length
  const radius = 19
  const swatchY = 26
  const defs = []
  const entries = KEY.map(([kind, lines], i) => {
    const cx = colW * i + colW / 2
    const { paint, def } = bandFill(kind, `key-${kind}`, swatchY - radius)
    if (def) defs.push(def)
    const label = lines
      .map((line, n) => `<tspan x="${cx}" dy="${n === 0 ? 0 : 19}">${line}</tspan>`)
      .join('')
    return `  <circle cx="${cx}" cy="${swatchY}" r="${radius}" fill="${paint}" stroke="${INK}" stroke-width="2"/>
  <text x="${cx}" y="${swatchY + radius + 22}" text-anchor="middle">${label}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 108" width="${width}" height="108" role="img">
  <defs>
    ${defs.join('\n    ')}
  </defs>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" fill="#6b6b6b">
${entries.join('\n')}
  </g>
</svg>
`
}

mkdirSync(OUT_DIR, { recursive: true })
for (const spec of DRINKS) {
  writeFileSync(join(OUT_DIR, `${spec.id}.svg`), drink(spec))
  console.log(`wrote ${spec.id}.svg`)
}
writeFileSync(join(OUT_DIR, 'key.svg'), key())
console.log('wrote key.svg')
