import type { AllergenItem, ProductItem, DiagramData, OrderItem, NoneOption } from '../../types'
import { shuffle, pickRandom } from '../../utils/shuffle'

export function buildImageQuestions(items: AllergenItem[]) {
  return shuffle(items).map((answer) => ({
    answer,
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
    mode: (Math.random() < 0.5 ? 'word' : 'image') as 'word' | 'image',
  }))
}

export function buildAudioQuestions(items: AllergenItem[], variants: string[]) {
  return shuffle(items).map((answer) => ({
    answer,
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
    variant: variants[Math.floor(Math.random() * variants.length)],
  }))
}

export function buildSentenceQuestions<V extends string>(items: AllergenItem[], variants: V[]) {
  return shuffle(items).map((answer) => {
    // Each item may only have audio for some of the sentences.
    const own = answer.variants ? variants.filter((v) => answer.variants!.includes(v)) : variants
    const choices = own.length ? own : variants
    return {
      answer,
      variant: choices[Math.floor(Math.random() * choices.length)],
      options: shuffle([answer, ...pickRandom(items, 3, answer)]),
    }
  })
}

export function buildProductQuestions(products: ProductItem[]) {
  const allNames = products.map((p) => p.name)
  return shuffle(products).map((product) => ({
    product,
    options: shuffle(allNames),
    correct: product.name,
  }))
}

export function buildDiagramQuestions(diagrams: DiagramData[]) {
  const allLabels = diagrams.flatMap((d) => d.hotspots.map((h) => h.label))
  return diagrams.flatMap((diagram) =>
    shuffle([...diagram.hotspots]).map((hotspot) => {
      const distractors = shuffle(allLabels.filter((l) => l !== hotspot.label)).slice(0, 3)
      return {
        image: diagram.image,
        diagramTitle: diagram.title,
        answer: hotspot.label,
        x: hotspot.x,
        y: hotspot.y,
        options: shuffle([hotspot.label, ...distractors]),
      }
    })
  )
}

export function buildIngredientQuestions(items: AllergenItem[]) {
  return shuffle(items).map((answer) => ({
    answer,
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
  }))
}

/**
 * Every item, asked for the allergen it contains. The wrong answers are the
 * other allergens named in the module, not other items: several items share an
 * allergen, so an item's name would otherwise appear as its own distractor.
 */
export function buildAllergenQuestions(items: AllergenItem[]) {
  const allergens = [...new Set(items.map((item) => item.allergen ?? ''))].filter(Boolean)
  return shuffle(items).map((answer) => ({
    answer,
    options: shuffle([answer.allergen!, ...pickRandom(allergens, 3, answer.allergen!)]),
  }))
}

/**
 * Every order, asked which item it names. The option for naming none of them
 * ("No milk") is offered every time, right answer or not: hearing that an order
 * has no milk in it is the point of the quiz, not a special case of it.
 */
export function buildOrderQuestions(orders: OrderItem[], items: AllergenItem[], none: NoneOption) {
  return shuffle(orders).map((order) => {
    const named = items.find((item) => item.id === order.item)
    const answer = named ?? none
    const offered = answer.id === none.id ? [answer] : [answer, none]
    const distractors = pickRandom(items.filter((item) => item.id !== answer.id), 4 - offered.length)
    return {
      order,
      answer,
      options: shuffle([...offered, ...distractors]) as { id: string; name: string }[],
    }
  })
}

/**
 * One question per hotspot, grouped by diagram so the picture doesn't change
 * between consecutive questions. The learner hears the hotspot's label and
 * must tap the matching marker on the diagram.
 */
export function buildDiagramAudioQuestions(diagrams: DiagramData[]) {
  return diagrams.flatMap((diagram) =>
    shuffle([...diagram.hotspots]).map((hotspot) => ({
      diagram,
      answer: hotspot,
    }))
  )
}

// One question of each kind, named so the components that render a single
// question can take it as a prop.
export type ImageQuestion = ReturnType<typeof buildImageQuestions>[number]
export type AudioQuestion = ReturnType<typeof buildAudioQuestions>[number]
export type SentenceQuestion<V extends string> = ReturnType<typeof buildSentenceQuestions<V>>[number]
export type ProductQuestion = ReturnType<typeof buildProductQuestions>[number]
export type DiagramQuestion = ReturnType<typeof buildDiagramQuestions>[number]
export type IngredientQuestion = ReturnType<typeof buildIngredientQuestions>[number]
export type AllergenQuestion = ReturnType<typeof buildAllergenQuestions>[number]
export type OrderQuestion = ReturnType<typeof buildOrderQuestions>[number]
/** Hear a part named, tap it on the diagram. Named apart from the component. */
export type HotspotAudioQuestion = ReturnType<typeof buildDiagramAudioQuestions>[number]
