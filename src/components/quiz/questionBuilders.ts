import type { AllergenItem, ProductItem, DiagramData } from '../../types'
import { shuffle, pickRandom } from '../../utils/shuffle'

export function buildImageQuestions(items: AllergenItem[]) {
  return shuffle(items).map((answer) => ({
    answer,
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
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
  return shuffle(items).map((answer) => ({
    answer,
    variant: variants[Math.floor(Math.random() * variants.length)],
    options: shuffle([answer, ...pickRandom(items, 3, answer)]),
  }))
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
