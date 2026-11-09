import { describe, it, expect } from 'vitest'
import {
  buildImageQuestions,
  buildAudioQuestions,
  buildSentenceQuestions,
  buildProductQuestions,
  buildDiagramQuestions,
  buildDiagramAudioQuestions,
  buildIngredientQuestions,
  buildAllergenQuestions,
  buildOrderQuestions,
} from './questionBuilders'
import type { AllergenItem, ProductItem, DiagramData, OrderItem } from '../../types'

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

  it('only uses the sentences an item has its own audio for', () => {
    const limited = items.map((item) => ({ ...item, variants: ['name', 'allergy-to', 'intolerant', 'cant-have'] }))
    for (let run = 0; run < 20; run++) {
      for (const q of buildSentenceQuestions(limited, KNOWN_VARIANTS)) {
        expect(['allergy-to', 'intolerant', 'cant-have']).toContain(q.variant)
      }
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

describe('IngredientMatch buildQuestions', () => {
  const qs = buildIngredientQuestions(items)

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

  it('asks about every item exactly once', () => {
    const asked = qs.map((q) => q.answer.id).sort()
    expect(asked).toEqual(items.map((i) => i.id).sort())
  })
})

describe('DiagramAudio buildQuestions', () => {
  const diagrams: DiagramData[] = [
    {
      id: 'd1',
      title: 'Coffee Machine',
      image: 'machine.jpg',
      hotspots: [
        { id: 'h1', label: 'Portafilter', x: 30, y: 60 },
        { id: 'h2', label: 'Steam wand', x: 70, y: 50 },
      ],
    },
    {
      id: 'd2',
      title: 'Grinder',
      image: 'grinder.jpg',
      hotspots: [
        { id: 'h3', label: 'Hopper', x: 50, y: 40 },
        { id: 'h4', label: 'Scales', x: 50, y: 80 },
        { id: 'h5', label: 'Tare button', x: 55, y: 85 },
      ],
    },
  ]
  const qs = buildDiagramAudioQuestions(diagrams)

  it('creates one question per hotspot', () => {
    expect(qs).toHaveLength(5)
  })

  it('asks about every hotspot exactly once', () => {
    const asked = qs.map((q) => q.answer.id).sort()
    expect(asked).toEqual(['h1', 'h2', 'h3', 'h4', 'h5'])
  })

  it('answer belongs to the question diagram', () => {
    for (const q of qs) {
      expect(q.diagram.hotspots).toContain(q.answer)
    }
  })

  it('keeps each diagram\'s questions together', () => {
    const order = qs.map((q) => q.diagram.id)
    expect(order).toEqual(['d1', 'd1', 'd2', 'd2', 'd2'])
  })
})

describe('AllergenMatch buildQuestions', () => {
  // Two milks share an allergen, as the real ones do.
  const milks: AllergenItem[] = [
    { id: 'oat', name: 'Oat milk', description: '', image: 'oat.svg', allergen: 'Cereals containing gluten' },
    { id: 'almond', name: 'Almond milk', description: '', image: 'almond.svg', allergen: 'Tree nuts' },
    { id: 'soya', name: 'Soya milk', description: '', image: 'soya.svg', allergen: 'Soya' },
    { id: 'coconut', name: 'Coconut milk', description: '', image: 'coconut.svg', allergen: 'No allergens' },
    { id: 'skimmed', name: 'Skimmed milk', description: '', image: 'skimmed.svg', allergen: 'Milk' },
    { id: 'whole', name: 'Whole milk', description: '', image: 'whole.svg', allergen: 'Milk' },
  ]
  const qs = buildAllergenQuestions(milks)

  it('asks about every item exactly once', () => {
    expect(qs.map((q) => q.answer.id).sort()).toEqual(milks.map((m) => m.id).sort())
  })

  it('each question has 4 allergens to choose from, including the right one', () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(q.options).toContain(q.answer.allergen)
      expect(new Set(q.options).size).toBe(4)
    }
  })

  it('offers each allergen once however many items carry it', () => {
    const allergens = new Set(milks.map((m) => m.allergen))
    for (const q of buildAllergenQuestions(milks)) {
      for (const option of q.options) expect(allergens).toContain(option)
    }
  })

  it('falls back to what there is when fewer than 4 allergens are named', () => {
    const two = milks.filter((m) => m.allergen === 'Milk' || m.allergen === 'Soya')
    for (const q of buildAllergenQuestions(two)) {
      expect(q.options).toEqual(expect.arrayContaining([q.answer.allergen!]))
      expect(q.options.length).toBeLessThanOrEqual(4)
    }
  })
})

describe('OrderMatch buildQuestions', () => {
  const milks = ['oat', 'almond', 'soya', 'coconut'].map(makeItem)
  const none = { id: 'none', name: 'No milk' }
  const orders: OrderItem[] = [
    { id: 'soya-cappuccino', text: 'a soya cappuccino', item: 'soya' },
    { id: 'black-americano', text: 'a black americano', item: 'none' },
    { id: 'oat-cortado', text: 'an oat cortado', item: 'oat' },
  ]
  const qs = buildOrderQuestions(orders, milks, none)

  it('asks about every order exactly once', () => {
    expect(qs.map((q) => q.order.id).sort()).toEqual(orders.map((o) => o.id).sort())
  })

  it('answers with the item the order names', () => {
    const asked = qs.find((q) => q.order.id === 'oat-cortado')!
    expect(asked.answer.name).toBe('Item oat')
  })

  it('answers with the no-milk option when the order names no item', () => {
    const asked = qs.find((q) => q.order.id === 'black-americano')!
    expect(asked.answer).toBe(none)
  })

  it('offers no milk every time, right answer or not', () => {
    for (const q of qs) {
      expect(q.options.map((o) => o.id)).toContain('none')
    }
  })

  it('each question has 4 options, including the answer, with no repeats', () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(q.options.map((o) => o.id)).toContain(q.answer.id)
      expect(new Set(q.options.map((o) => o.id)).size).toBe(4)
    }
  })
})
