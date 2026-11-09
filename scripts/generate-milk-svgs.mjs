#!/usr/bin/env node
/**
 * Generate the milk illustrations for the milk module.
 *
 * Usage:
 *   node scripts/generate-milk-svgs.mjs
 *
 * Output:
 *   public/content/milk/images/<id>.svg   one per milk
 *
 * Two shapes, because the two kinds of milk are told apart in different ways.
 * Plant milks come in a gable-top carton and are named by what they are made
 * from, so each carton carries that thing on its label: oats, an almond, a soya
 * pod, a coconut. The three cow's milks come in a bottle and differ only by the
 * colour of the cap — red skimmed, green semi-skimmed, blue whole — which is how
 * they are told apart on a real fridge shelf, and the only cue there is.
 *
 * No words are drawn on the labels: the picture is shown beside the name, and a
 * written name in the picture would answer a picture quiz on its own.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'content', 'milk', 'images')

const MILKS = [
  { id: 'oat', pack: 'carton', motif: 'oats' },
  { id: 'almond', pack: 'carton', motif: 'almond' },
  { id: 'soya', pack: 'carton', motif: 'pod' },
  { id: 'coconut', pack: 'carton', motif: 'coconut' },
  { id: 'skimmed', pack: 'bottle', cap: '#d7263d' },
  { id: 'semi-skimmed', pack: 'bottle', cap: '#2d8f4e' },
  { id: 'whole', pack: 'bottle', cap: '#1d6fb8' },
]

const W = 300
const H = 200
const INK = '#2b2b2b'
const CX = 150
const BOTTOM = 182 // every pack stands on the same line
const STROKE = 5
const LINE = 2.6 // the thinner stroke the labels and motifs are drawn with

const r2 = (n) => Math.round(n * 100) / 100

/** A gable-top carton: a rectangular face, a sloped top and the crimped fin above it. */
function carton() {
  const x0 = 100, x1 = 200
  const shoulder = 78 // where the face stops and the roof starts
  const ridge = 46
  const inset = 26 // how far in the roof leans on each side
  const fin = { x0: CX - 21, x1: CX + 21, top: 34 }

  const face = `M ${x0} ${shoulder} L ${x0} ${BOTTOM - 8} Q ${x0} ${BOTTOM} ${x0 + 10} ${BOTTOM}`
    + ` L ${x1 - 10} ${BOTTOM} Q ${x1} ${BOTTOM} ${x1} ${BOTTOM - 8} L ${x1} ${shoulder} Z`
  const roof = `M ${x0} ${shoulder} L ${x0 + inset} ${ridge} L ${x1 - inset} ${ridge} L ${x1} ${shoulder}`
  const finPath = `M ${fin.x0} ${ridge} L ${fin.x0} ${fin.top} L ${fin.x1} ${fin.top} L ${fin.x1} ${ridge}`

  return {
    body: [
      `<path d="${finPath}" fill="#fff" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>`,
      `<path d="${roof} Z" fill="#fff" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>`,
      `<path d="${face}" fill="#fff" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>`,
      // The fold between the roof and the face, drawn over both.
      `<line x1="${x0}" y1="${shoulder}" x2="${x1}" y2="${shoulder}" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="round"/>`,
    ].join('\n  '),
    // The label the motif sits in.
    label: { x0: x0 + 1, x1: x1 - 1, y0: 104, y1: 152 },
  }
}

/** A pint bottle: a straight body, shoulders drawn in to a short neck, and the cap. */
function bottle(cap) {
  const x0 = 106, x1 = 194
  const shoulder = 92
  const neck = { x0: CX - 19, x1: CX + 19, y: 58 }
  const capTop = 30, capBottom = 52

  const body = `M ${x0} ${shoulder}`
    + ` L ${x0} ${BOTTOM - 10} Q ${x0} ${BOTTOM} ${x0 + 12} ${BOTTOM}`
    + ` L ${x1 - 12} ${BOTTOM} Q ${x1} ${BOTTOM} ${x1} ${BOTTOM - 10}`
    + ` L ${x1} ${shoulder}`
    // Shoulders: a curve from the top of each side in to the neck.
    + ` C ${x1} ${shoulder - 22} ${neck.x1} ${neck.y + 24} ${neck.x1} ${neck.y}`
    + ` L ${neck.x0} ${neck.y}`
    + ` C ${neck.x0} ${neck.y + 24} ${x0} ${shoulder - 22} ${x0} ${shoulder} Z`

  return {
    body: [
      `<path d="${body}" fill="#fff" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>`,
      `<rect x="${neck.x0 - 5}" y="${capTop}" width="${neck.x1 - neck.x0 + 10}" height="${capBottom - capTop}" rx="4"`
        + ` fill="${cap}" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>`,
      // The ring under the cap, which reads as the screw thread.
      `<line x1="${neck.x0}" y1="${capBottom + 4}" x2="${neck.x1}" y2="${capBottom + 4}"`
        + ` stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>`,
    ].join('\n  '),
    label: { x0: x0 + 1, x1: x1 - 1, y0: 116, y1: 158 },
  }
}

const MOTIFS = {
  /** An ear of oats: a stem with grains hanging off it in pairs. */
  oats: (cx, cy) => {
    const grains = []
    for (const [i, y] of [cy - 17, cy - 5, cy + 7].entries()) {
      const spread = 10 + i * 2.5
      for (const side of [-1, 1]) {
        grains.push(
          `<ellipse cx="${r2(cx + side * spread)}" cy="${r2(y + 4)}" rx="4.6" ry="8" fill="none"`
            + ` stroke="${INK}" stroke-width="${LINE}" transform="rotate(${side * 28} ${r2(cx + side * spread)} ${r2(y + 4)})"/>`,
          `<line x1="${r2(cx)}" y1="${r2(y + 1)}" x2="${r2(cx + side * (spread - 4))}" y2="${r2(y - 1)}"`
            + ` stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>`,
        )
      }
    }
    return [
      `<line x1="${cx}" y1="${r2(cy - 22)}" x2="${cx}" y2="${r2(cy + 20)}" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>`,
      ...grains,
    ].join('\n  ')
  },

  /** One almond, pointed at the top, with the seam down the middle. */
  almond: (cx, cy) => [
    `<path d="M ${cx} ${r2(cy - 21)} C ${r2(cx + 15)} ${r2(cy - 10)} ${r2(cx + 14)} ${r2(cy + 14)} ${cx} ${r2(cy + 20)}`
      + ` C ${r2(cx - 14)} ${r2(cy + 14)} ${r2(cx - 15)} ${r2(cy - 10)} ${cx} ${r2(cy - 21)} Z"`
      + ` fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>`,
    `<path d="M ${cx} ${r2(cy - 13)} C ${r2(cx + 4)} ${r2(cy - 2)} ${r2(cx + 4)} ${r2(cy + 6)} ${cx} ${r2(cy + 13)}"`
      + ` fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>`,
  ].join('\n  '),

  /**
   * A soya pod with the beans showing through. Tilted, and with a stalk and a
   * seam: level and bare, the same shape reads as an eye.
   */
  pod: (cx, cy) => {
    const beans = [-17, 0, 17].map(
      (dx) => `<circle cx="${r2(cx + dx)}" cy="${cy}" r="6" fill="none" stroke="${INK}" stroke-width="${LINE}"/>`,
    )
    return `<g transform="rotate(-20 ${cx} ${cy})">
  <path d="M ${r2(cx - 31)} ${cy} Q ${cx} ${r2(cy - 17)} ${r2(cx + 31)} ${cy} Q ${cx} ${r2(cy + 17)} ${r2(cx - 31)} ${cy} Z"`
      + ` fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>
  <path d="M ${r2(cx - 31)} ${cy} q 8 -5 14 -5" fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>
  <line x1="${r2(cx + 31)}" y1="${cy}" x2="${r2(cx + 39)}" y2="${r2(cy - 5)}" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>
  ${beans.join('\n  ')}
  </g>`
  },

  /**
   * A coconut: the shell with the grain of the husk across it. Deliberately
   * no three dots — spaced like eyes above any arc, they make it a face.
   */
  coconut: (cx, cy) => {
    const r = 19
    const fibres = [-10, -3.5, 3.5, 10].map((offset) => {
      // Each fibre is a chord of the shell, bowed so the husk looks wound round it.
      const half = Math.sqrt(r * r - offset * offset) - 2
      return `<path d="M ${r2(cx - half)} ${r2(cy + offset)} q ${r2(half)} ${r2(offset < 0 ? -5 : 5)} ${r2(half * 2)} 0"`
        + ` fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round"/>`
    })
    return [
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="${LINE}"/>`,
      ...fibres,
    ].join('\n  ')
  },
}

function milk({ pack, motif, cap }) {
  const shape = pack === 'carton' ? carton() : bottle(cap)
  const { x0, x1, y0, y1 } = shape.label
  const label = `<rect x="${x0}" y="${y0}" width="${r2(x1 - x0)}" height="${r2(y1 - y0)}" fill="none" stroke="${INK}" stroke-width="${LINE}"/>`
  const inside = motif ? MOTIFS[motif]((x0 + x1) / 2, (y0 + y1) / 2) : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
  ${shape.body}
  ${label}
  ${inside}
</svg>
`
}

mkdirSync(OUT_DIR, { recursive: true })
for (const spec of MILKS) {
  writeFileSync(join(OUT_DIR, `${spec.id}.svg`), milk(spec))
  console.log(`wrote ${spec.id}.svg`)
}
