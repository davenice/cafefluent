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
// The ids are what the sent message numbers, so **never renumber or reorder
// them** once a cohort has sat the paper. Add to the end, and bump `version`.

import type { Exam } from '../exam/types'

export const FINAL_EXAM: Exam = {
  id: 'final-exam',
  title: 'Final exam',
  description: 'The last thing you do. You write your answers and send them to your tutor.',
  messageTitle: 'CafeFluent exam',
  version: 'v1',
  intro: [
    'This is the final exam. There are 20 questions.',
    'You type your answers. Nothing is marked by the app — your tutor reads your answers.',
    'Take your time. Your answers are saved as you type, so you can stop and come back.',
    'At the end you send your answers to your tutor on WhatsApp.',
  ],
  questions: [
    // --- Bread -------------------------------------------------------------
    {
      id: 'q1',
      ask: 'What is this bread called?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'bread', item: 'ciabatta' },
      answer: 'word',
    },
    {
      id: 'q2',
      ask: 'What is this bread called?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'bread', item: 'sourdough' },
      answer: 'word',
    },
    {
      id: 'q3',
      ask: 'Which bread do you use to make this?',
      guidance: 'Write the name of the bread.',
      show: { kind: 'product-image', module: 'bread', product: 'panini' },
      answer: 'word',
    },

    // --- Cakes and snacks --------------------------------------------------
    {
      id: 'q4',
      ask: 'What is this called?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'pain-au-chocolat' },
      answer: 'word',
    },
    {
      id: 'q5',
      ask: 'What is this called?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'cornish-pasty' },
      answer: 'word',
    },

    // --- Coffee drinks -----------------------------------------------------
    {
      id: 'q6',
      // As with q16 and q17, the two drink questions read identically: a line on
      // one and not the other is itself a clue.
      ask: 'Which coffee drink is this?',
      guidance: 'The picture is a cut through the cup.',
      show: { kind: 'item-image', module: 'coffee-drinks', item: 'flat-white' },
      answer: 'word',
    },
    {
      id: 'q7',
      ask: 'Which coffee drink is this?',
      guidance: 'The picture is a cut through the cup.',
      show: { kind: 'item-image', module: 'coffee-drinks', item: 'macchiato' },
      answer: 'word',
    },
    {
      id: 'q8',
      // No picture: for this module the picture is a drawing of the ingredients,
      // so showing it would give the answer away.
      ask: 'What goes in a cappuccino?',
      guidance: 'Write each thing on a new line.',
      show: { kind: 'none' },
      answer: 'list',
    },

    // --- Allergens ---------------------------------------------------------
    {
      id: 'q9',
      ask: 'Which allergen is this?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'allergens', item: 'sesame' },
      answer: 'word',
    },
    {
      id: 'q10',
      ask: 'Which allergen is this?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'allergens', item: 'lupin' },
      answer: 'word',
    },
    {
      id: 'q11',
      ask: 'Listen. Which allergen is this?',
      guidance: 'You can play it again as many times as you like.',
      show: { kind: 'item-audio', module: 'allergens', item: 'molluscs' },
      answer: 'word',
    },
    {
      id: 'q12',
      ask: 'Listen to the customer. What must they not eat?',
      guidance: 'Write the name of the food.',
      show: { kind: 'item-audio', module: 'allergens', item: 'nuts', variant: 'must-not-eat' },
      answer: 'word',
    },
    {
      id: 'q13',
      ask: 'Listen to the customer. What can they not have?',
      guidance: 'Write the name of the food.',
      show: { kind: 'item-audio', module: 'allergens', item: 'crustaceans', variant: 'cant-have' },
      answer: 'word',
    },

    // --- Milk --------------------------------------------------------------
    {
      id: 'q14',
      // Named, not shown. The milk pictures are drawings of cartons and bottles
      // with no name on them, so a picture would ask the learner to identify the
      // drawing first — which is not what this question is for. The module's own
      // quiz gives the name alongside the picture for the same reason.
      ask: 'Which allergen is in oat milk?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'milk', item: 'oat' },
      answer: 'word',
    },
    {
      id: 'q15',
      ask: 'Which allergen is in almond milk?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'milk', item: 'almond' },
      answer: 'word',
    },
    {
      id: 'q16',
      // q16 and q17 must read identically. One of these orders names no milk at
      // all, and noticing that is the whole point — so anything said about one
      // and not the other tells the learner which is which.
      ask: 'Listen to the order. Which milk do you use?',
      guidance: 'Write the name of the milk.',
      show: { kind: 'order-audio', module: 'milk', order: 'skinny-cappuccino' },
      answer: 'word',
    },
    {
      id: 'q17',
      ask: 'Listen to the order. Which milk do you use?',
      guidance: 'Write the name of the milk.',
      show: { kind: 'order-audio', module: 'milk', order: 'americano-no-milk' },
      answer: 'word',
    },

    // --- Kitchen equipment -------------------------------------------------
    {
      id: 'q18',
      ask: 'What is this called?',
      guidance: 'One or two words is enough.',
      show: { kind: 'item-image', module: 'kitchen-equipment', item: 'saucer' },
      answer: 'word',
    },

    // --- Writing -----------------------------------------------------------
    // The two things typing can test that tapping cannot.
    {
      id: 'q19',
      ask: 'You are making a coffee with milk. Write the steps in the right order.',
      guidance: 'Write one step on each line. You do not need every step.',
      show: { kind: 'none' },
      answer: 'list',
    },
    {
      id: 'q20',
      ask: 'A customer tells you they are allergic to nuts. They want to buy a cake. What do you say to them?',
      guidance: 'Write one or two sentences.',
      show: { kind: 'none' },
      answer: 'sentence',
    },
  ],
}
