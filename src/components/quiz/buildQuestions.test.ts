import { describe, it, expect } from 'vitest'
import {
  buildImageQuestions,
  buildAudioQuestions,
  buildSentenceQuestions,
  buildProductQuestions,
  buildDiagramQuestions,
} from './questionBuilders'
import type { AllergenItem, ProductItem, DiagramData } from '../../types'

const makeItem = (id: string): AllergenItem => ({
  id, name: `Item ${id}`, description: `Desc ${id}`, image: `${id}.jpg`,
})

const items = ['a', 'b', 'c', 'd', 'e'].map(makeItem)

describe('ImageMatch buildQuestions', () => {
  const qs = buildImageQuestions(items)

  it('creates one question per item', () => {
    expect(qs).toHaveLength(items.length)
  })

  it('each question includes its answer in options', () => {
    for (const q of qs) {
      expect(q.options).toContainEqual(q.answer)
    }
  })

  it('each question has exactly 4 options', () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('options contain no duplicates', () => {
    for (const q of qs) {
      const ids = q.options.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('all options come from the input items', () => {
    const itemIds = new Set(items.map((i) => i.id))
    for (const q of qs) {
      for (const opt of q.options) {
        expect(itemIds.has(opt.id)).toBe(true)
      }
    }
  })
})

describe('AudioMatch buildQuestions', () => {
  const variants = ['name', 'sentence']
  const qs = buildAudioQuestions(items, variants)

  it('creates one question per item', () => {
    expect(qs).toHaveLength(items.length)
  })

  it('each question includes its answer in options', () => {
    for (const q of qs) {
      expect(q.options).toContainEqual(q.answer)
    }
  })

  it('each question has exactly 4 options', () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('variant is one of the provided variants', () => {
    for (const q of qs) {
      expect(variants).toContain(q.variant)
    }
  })
})

describe('SentenceMatch buildQuestions', () => {
  const KNOWN_VARIANTS = ['allergic', 'intolerant', 'must-not-eat', 'cant-eat', 'allergy-to', 'cant-have']
  const qs = buildSentenceQuestions(items, KNOWN_VARIANTS)

  it('creates one question per item', () => {
    expect(qs).toHaveLength(items.length)
  })

  it('each question includes its answer in options', () => {
    for (const q of qs) {
      expect(q.options).toContainEqual(q.answer)
    }
  })

  it('each question has exactly 4 options', () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('variant is a known sentence variant', () => {
    for (const q of qs) {
      expect(KNOWN_VARIANTS).toContain(q.variant)
    }
  })
})

describe('ProductMatch buildQuestions', () => {
  const products: ProductItem[] = [
    { id: 'p1', name: 'Croissant', image: 'p1.jpg', breadAnswer: 'c', breadIds: [] },
    { id: 'p2', name: 'Baguette', image: 'p2.jpg', breadAnswer: 'b', breadIds: [] },
    { id: 'p3', name: 'Sourdough', image: 'p3.jpg', breadAnswer: 's', breadIds: [] },
  ]
  const qs = buildProductQuestions(products)
  const allNames = products.map((p) => p.name)

  it('creates one question per product', () => {
    expect(qs).toHaveLength(products.length)
  })

  it('correct matches the product name', () => {
    for (const q of qs) {
      expect(q.correct).toBe(q.product.name)
    }
  })

  it('options contain all product names', () => {
    for (const q of qs) {
      expect([...q.options].sort()).toEqual([...allNames].sort())
    }
  })
})

describe('DiagramLabel buildQuestions', () => {
  const diagrams: DiagramData[] = [
    {
      id: 'd1',
      title: 'Coffee Machine',
      image: 'machine.jpg',
      hotspots: [
        { id: 'h1', label: 'Portafilter', x: 30, y: 60 },
        { id: 'h2', label: 'Steam wand', x: 70, y: 50 },
        { id: 'h3', label: 'Group head', x: 50, y: 40 },
        { id: 'h4', label: 'Drip tray', x: 50, y: 80 },
      ],
    },
  ]
  const qs = buildDiagramQuestions(diagrams)
  const hotspotMap = new Map(diagrams.flatMap((d) => d.hotspots.map((h) => [h.label, h])))

  it('creates one question per hotspot', () => {
    const totalHotspots = diagrams.reduce((sum, d) => sum + d.hotspots.length, 0)
    expect(qs).toHaveLength(totalHotspots)
  })

  it('answer matches a real hotspot label', () => {
    const allLabels = new Set(diagrams.flatMap((d) => d.hotspots.map((h) => h.label)))
    for (const q of qs) {
      expect(allLabels.has(q.answer)).toBe(true)
    }
  })

  it('each question has exactly 4 options', () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('answer is always in options', () => {
    for (const q of qs) {
      expect(q.options).toContain(q.answer)
    }
  })

  it('x and y match the hotspot coordinates', () => {
    for (const q of qs) {
      const hotspot = hotspotMap.get(q.answer)!
      expect(q.x).toBe(hotspot.x)
      expect(q.y).toBe(hotspot.y)
    }
  })
})
