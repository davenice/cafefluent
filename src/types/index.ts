export interface AllergenItem {
  id: string
  name: string
  description: string
  image: string
  imagePosition?: string
  audio?: string
}

export interface ProductItem {
  id: string
  name: string
  image: string
  breadAnswer: string
  breadIds: string[]
}

export interface ModuleData {
  id: string
  title: string
  items: AllergenItem[]
  products?: ProductItem[]
  diagrams?: DiagramData[]
}

export interface Hotspot {
  id: string
  label: string
  x: number
  y: number
}

export interface DiagramData {
  id: string
  title: string
  image: string
  hotspots: Hotspot[]
}

export type TaskType = 'revision' | 'image-match' | 'audio-match' | 'sentence-match' | 'product-match' | 'diagram-label' | 'ingredient-match'

export interface TaskDef {
  id: string
  type: TaskType
  title: string
  audioVariants?: string[]
}

export interface ModuleDef {
  id: string
  title: string
  description: string
  revisionIntro?: string
  dataUrl: string
  imageBase: string
  audioBase?: string
  /** How item images fill their frame. Photos want 'cover'; line art wants 'contain'. Defaults to 'cover'. */
  imageFit?: 'cover' | 'contain'
  /**
   * Filename (under imageBase) of a key explaining the notation used in the item images.
   * Shown during picture quizzes for modules whose images are diagrams rather than photos.
   */
  imageLegend?: string
  /**
   * Suppress the item description in quiz prompts. Set where the description gives the
   * answer away — the coffee drink illustrations are a picture of their own ingredients.
   */
  hideDescriptionInQuiz?: boolean
  tasks: TaskDef[]
}

export interface ProgressEntry {
  score: number
  total: number
  completedAt: string
}
