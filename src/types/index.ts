export interface AllergenItem {
  id: string
  name: string
  description: string
  image: string
  audio?: string
}

export interface ModuleData {
  id: string
  title: string
  items: AllergenItem[]
}

export type TaskType = 'image-match'

export interface TaskDef {
  id: string
  type: TaskType
  title: string
}

export interface ModuleDef {
  id: string
  title: string
  description: string
  dataUrl: string
  imageBase: string
  tasks: TaskDef[]
}

export interface ProgressEntry {
  score: number
  total: number
  completedAt: string
}
