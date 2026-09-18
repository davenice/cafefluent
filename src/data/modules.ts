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
    id: 'coffee-drinks',
    title: 'Coffee drinks',
    description: 'Learn the nine classic coffee drinks and what goes in them',
    revisionIntro: 'Nine drinks, made from the same few ingredients. Each picture is a cut-through of the cup, so whatever sits at the bottom went in first — that is the only thing separating an americano from a long black.',
    dataUrl: '/content/coffee-drinks/data.json',
    imageBase: '/content/coffee-drinks/images/',
    audioBase: '/content/coffee-drinks/audio/',
    imageFit: 'contain',
    imageLegend: 'key.svg',
    hideDescriptionInQuiz: true,
    tasks: [
      {
        id: 'task0',
        type: 'revision',
        title: 'Meet the coffee drinks',
      },
      {
        id: 'task1',
        type: 'image-match',
        title: 'Match the drink name and picture',
      },
      {
        id: 'task2',
        type: 'ingredient-match',
        title: 'Match the ingredients to the drink',
      },
      {
        id: 'task3',
        type: 'audio-match',
        title: 'Listen and match the drink name',
      },
    ],
  },
  {
    id: 'cakes-and-snacks',
    title: 'Cakes and snacks',
    description: 'Learn to recognise and name the cakes, pastries and savoury snacks on the counter',
    revisionIntro: 'The counter is full of cakes, pastries and savoury snacks. Learn their names so you can point customers to what they want and take orders confidently.',
    dataUrl: '/content/cakes-and-snacks/data.json',
    imageBase: '/content/cakes-and-snacks/images/',
    audioBase: '/content/cakes-and-snacks/audio/',
    tasks: [
      {
        id: 'task0',
        type: 'revision',
        title: 'Meet the cakes and snacks',
      },
      {
        id: 'task1',
        type: 'image-match',
        title: 'Match the name and picture',
      },
      {
        id: 'task2',
        type: 'audio-match',
        title: 'Listen and match the picture',
      },
    ],
  },
  {
    id: 'coffee',
    title: 'Barista equipment',
    description: 'Learn the vocabulary of barista equipment and preparation',
    dataUrl: '/content/coffee/data.json',
    imageBase: '/content/coffee/images/',
    audioBase: '/content/coffee/audio/',
    tasks: [
      {
        id: 'task1',
        type: 'diagram-label',
        title: 'Label the barista equipment',
      },
      {
        id: 'task2',
        type: 'diagram-audio',
        title: 'Listen and find the part',
      },
    ],
  },
  {
    // Try-out module for new quiz styles. Enable it from the admin page to see it.
    id: 'preview',
    title: 'Preview',
    description: 'New quiz styles we are trying out',
    dataUrl: '/content/preview/data.json',
    imageBase: '/content/preview/images/',
    tasks: [
      {
        id: 'task1',
        type: 'sequence-order',
        title: 'Making a basic coffee drink',
        sequenceId: 'basic-coffee',
      },
    ],
  },
]
