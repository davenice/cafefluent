import type { ModuleDef } from '../types'

export const MODULES: ModuleDef[] = [
  {
    id: 'allergens',
    title: 'Allergens',
    description: 'Learn to recognise and name the 14 major allergens',
    dataUrl: '/content/allergens/data.json',
    imageBase: '/content/allergens/images/',
    audioBase: '/content/allergens/audio/',
    tasks: [
      {
        id: 'task1',
        type: 'image-match',
        title: 'Match the allergen to its image',
      },
      {
        id: 'task2',
        type: 'audio-match',
        title: 'Listen and match the allergen name',
      },
    ],
  },
]
