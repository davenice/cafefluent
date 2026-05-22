import type { ModuleDef } from '../types'

export const MODULES: ModuleDef[] = [
  {
    id: 'allergens',
    title: 'Allergens',
    description: 'Learn to recognise and name the 14 major allergens',
    dataUrl: '/cafefluent/content/allergens/data.json',
    imageBase: '/cafefluent/content/allergens/images/',
    tasks: [
      {
        id: 'task1',
        type: 'image-match',
        title: 'Match the allergen to its image',
      },
    ],
  },
]
