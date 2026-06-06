import type { ModuleDef } from '../types'

export const MODULES: ModuleDef[] = [
  {
    id: 'allergens',
    title: 'Allergens',
    description: 'Learn to recognise and name the 14 major allergens',
    revisionIntro: 'There are 14 major allergens that must be declared on food labels. Learn their names and what they include.',
    dataUrl: '/content/allergens/data.json',
    imageBase: '/content/allergens/images/',
    audioBase: '/content/allergens/audio/',
    tasks: [
      {
        id: 'task0',
        type: 'revision',
        title: 'Meet the allergens',
      },
      {
        id: 'task1',
        type: 'image-match',
        title: 'Match the allergen name and image',
      },
      {
        id: 'task2',
        type: 'audio-match',
        title: 'Listen and match the allergen name',
      },
      {
        id: 'task3',
        type: 'sentence-match',
        title: 'Listen and find the allergen',
      },
    ],
  },
  {
    id: 'bread',
    title: 'Bread',
    description: 'Learn to recognise and name different types of bread',
    revisionIntro: 'Cafés serve a wide variety of breads. Learn their names so you can describe them to customers and take orders confidently.',
    dataUrl: '/content/bread/data.json',
    imageBase: '/content/bread/images/',
    audioBase: '/content/bread/audio/',
    tasks: [
      {
        id: 'task0',
        type: 'revision',
        title: 'Types of bread',
      },
      {
        id: 'task1',
        type: 'image-match',
        title: 'Match the bread name and image',
      },
      {
        id: 'task2',
        type: 'audio-match',
        title: 'Listen and match the bread name',
      },
      {
        id: 'task3',
        type: 'product-match',
        title: 'Match the product name',
      },
    ],
  },
  {
    id: 'coffee',
    title: 'Coffee equipment',
    description: 'Learn the vocabulary of coffee equipment and preparation',
    dataUrl: '/content/coffee/data.json',
    imageBase: '/content/coffee/images/',
    tasks: [
      {
        id: 'task1',
        type: 'diagram-label',
        title: 'Label the coffee equipment',
      },
    ],
  },
]
