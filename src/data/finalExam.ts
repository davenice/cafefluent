// The final exam: sat once, at the end of the course, and fixed from then on.
//
// Every question mirrors a quiz the learner has already met, with the tapping
// replaced by typing — producing the word yourself is a much harder task than
// picking it from four options, and that is what this measures. Nothing here is
// marked by the app: the answers are sent to the course leader, who reads them.
//
// Questions point at content the modules already own, by module and item id
// (see src/exam/content.ts). `scripts/content.test.ts` checks every reference.
//
// **The order is deliberate and the numbering is load-bearing.** The sent
// message is a column of numbers, so a question's position is the only thing
// telling the course leader which answer they are reading. The paper is laid
// out so no two questions in a row come from the same module, which is what
// stops it feeling like a set of category rounds — but it is one fixed shuffle,
// not a per-learner one. Shuffling per learner would number every message
// differently and leave nothing to mark against.
//
// So never reorder or renumber once a group has sat it. Add to the end, and
// bump `version`: a learner's saved answers are thrown away when the version
// changes, since they would otherwise land against the wrong questions.

import type { Exam } from '../exam/types'

export const FINAL_EXAM: Exam = {
  id: 'final-exam',
  title: 'Final exam',
  description: 'The last thing you do. You write your answers and send them to your tutor.',
  messageTitle: 'CafeFluent exam',
  version: 'v2',
  intro: [
    'This is the final exam. There are 20 questions.',
    'You type your answers. Nothing is marked by the app — your tutor reads your answers.',
    'Take your time. Your answers are saved as you type, so you can stop and come back.',
    'At the end you send your answers to your tutor on WhatsApp.',
  ],
  questions: [
    {
      id: 'q1',
      ask: 'What is this bread called?',
      show: { kind: 'item-image', module: 'bread', item: 'sourdough' },
      answer: 'word',
    },
    {
      id: 'q2',
      ask: 'Which allergen is this?',
      show: { kind: 'item-image', module: 'allergens', item: 'sesame' },
      answer: 'word',
    },
    {
      id: 'q3',
      // The drink pictures are cut-throughs drawn in a notation the module
      // teaches with a key, and the key is shown alongside — without it the
      // question is about reading the drawing rather than knowing the drink.
      ask: 'Which coffee drink is this?',
      guidance: 'The picture is a cut through the cup.',
      show: { kind: 'item-image', module: 'coffee-drinks', item: 'cappuccino' },
      answer: 'word',
    },
    {
      id: 'q4',
      // Named rather than shown: the milk pictures are drawings of cartons with
      // no name on them, so a picture would ask the learner to identify the
      // drawing first. The module's own quiz gives the name with the picture.
      ask: 'Which allergen is in oat milk?',
      show: { kind: 'none' },
      answer: 'word',
    },
    {
      id: 'q5',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'pain-au-chocolat' },
      answer: 'word',
    },
    {
      id: 'q6',
      ask: 'Listen. Which allergen is this?',
      guidance: 'You can play it again as many times as you like.',
      show: { kind: 'item-audio', module: 'allergens', item: 'mustard' },
      answer: 'word',
    },
    {
      id: 'q7',
      ask: 'What is the informal name for this bread-based dish?',
      show: { kind: 'product-image', module: 'bread', product: 'butty' },
      answer: 'word',
    },
    {
      id: 'q8',
      ask: 'How do you make a mocha?',
      guidance: 'Write one step on each line.',
      show: { kind: 'none' },
      answer: 'list',
    },
    {
      id: 'q9',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'kitchen-equipment', item: 'saucer' },
      answer: 'word',
    },
    {
      id: 'q10',
      ask: 'Listen to the customer. What must they not eat?',
      guidance: 'Write the name of the food.',
      show: { kind: 'item-audio', module: 'allergens', item: 'nuts', variant: 'must-not-eat' },
      answer: 'word',
    },
    {
      id: 'q11',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'millionaires-shortbread' },
      answer: 'word',
    },
    {
      id: 'q12',
      // q12 and q18 must read identically. One of the two orders names no milk
      // at all, and noticing that is the point — so anything said about one and
      // not the other tells the learner which is which.
      ask: 'Listen to the order. Which milk do you use?',
      guidance: 'Write the name of the milk.',
      show: { kind: 'order-audio', module: 'milk', order: 'skinny-cappuccino' },
      answer: 'word',
    },
    {
      id: 'q13',
      ask: 'Which coffee drink is this?',
      guidance: 'The picture is a cut through the cup.',
      show: { kind: 'item-image', module: 'coffee-drinks', item: 'cortado' },
      answer: 'word',
    },
    {
      id: 'q14',
      ask: 'Which allergen is in almond milk?',
      show: { kind: 'none' },
      answer: 'word',
    },
    {
      id: 'q15',
      ask: 'What is the name of this bread-based dish?',
      show: { kind: 'product-image', module: 'bread', product: 'panini' },
      answer: 'word',
    },
    {
      id: 'q16',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'flapjack' },
      answer: 'word',
    },
    {
      id: 'q17',
      ask: 'Which allergen is this?',
      show: { kind: 'item-image', module: 'allergens', item: 'gluten' },
      answer: 'word',
    },
    {
      id: 'q18',
      ask: 'Listen to the order. Which milk do you use?',
      guidance: 'Write the name of the milk.',
      show: { kind: 'order-audio', module: 'milk', order: 'americano-no-milk' },
      answer: 'word',
    },
    {
      id: 'q19',
      ask: 'What goes in an americano?',
      guidance: 'Write each thing on a new line.',
      show: { kind: 'none' },
      answer: 'list',
    },
    {
      id: 'q20',
      ask: 'What is the name of this bread-based dish?',
      show: { kind: 'product-image', module: 'bread', product: 'toasty' },
      answer: 'word',
    },
  ],
}
