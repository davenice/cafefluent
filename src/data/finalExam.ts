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
// telling the course leader which answer they are reading. Two rules shape it:
//
//   1. The listening questions come first. On paper the course leader reads
//      the phrase out, so grouping them means reading four phrases once at the
//      start rather than interrupting the room four times.
//   2. After those, no two questions in a row come from the same module, and
//      no two sharing their wording sit next to each other. That is what stops
//      it reading as a set of category rounds.
//
// It is one fixed shuffle, not a per-learner one: shuffling per learner would
// number every message differently and leave nothing to mark against.
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
  version: 'v3',
  intro: [
    'This is the final exam. There are 20 questions.',
    'You type your answers. Nothing is marked by the app — your tutor reads your answers.',
    'Take your time. Your answers are saved as you type, so you can stop and come back.',
    'At the end you send your answers to your tutor on WhatsApp.',
  ],
  questions: [
    // --- The listening questions, together at the front ---------------------
    // Alternating allergen and order, so the two that share their wording
    // (q2 and q4, and one of them names no milk at all) are not side by side.
    {
      id: 'q1',
      // A customer's whole sentence, not the bare word. The guidance says
      // nothing about replaying it: the play button already says "Tap to
      // listen again" underneath itself.
      ask: 'Listen. Which allergen is this?',
      guidance: 'Write the name of the food.',
      show: { kind: 'item-audio', module: 'allergens', item: 'mustard', variant: 'allergic' },
      answer: 'word',
    },
    {
      id: 'q2',
      // q2 and q4 must read identically. One of the two orders names no milk
      // at all, and noticing that is the point — so anything said about one and
      // not the other tells the learner which is which.
      ask: 'Listen to the order. Which milk do you use?',
      guidance: 'Write the name of the milk.',
      show: { kind: 'order-audio', module: 'milk', order: 'skinny-cappuccino' },
      answer: 'word',
    },
    {
      id: 'q3',
      // Peanuts has no "I mustn't eat" clip recorded — its sentences are
      // allergic, intolerant and cant-eat — and "I'm allergic to" is already
      // q1's phrasing, so this one asks the question "I can't eat" fits.
      ask: 'Listen to the customer. What can they not eat?',
      guidance: 'Write the name of the food.',
      show: { kind: 'item-audio', module: 'allergens', item: 'peanuts', variant: 'cant-eat' },
      answer: 'word',
    },
    {
      id: 'q4',
      ask: 'Listen to the order. Which milk do you use?',
      guidance: 'Write the name of the milk.',
      show: { kind: 'order-audio', module: 'milk', order: 'americano-no-milk' },
      answer: 'word',
    },

    // --- The rest -----------------------------------------------------------
    {
      id: 'q5',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'pain-au-chocolat' },
      answer: 'word',
    },
    {
      id: 'q6',
      ask: 'What is this bread called?',
      show: { kind: 'item-image', module: 'bread', item: 'sourdough' },
      answer: 'word',
    },
    {
      id: 'q7',
      // The drink pictures are cut-throughs drawn in a notation the module
      // teaches with a key, and the key is shown alongside — without it the
      // question is about reading the drawing rather than knowing the drink.
      ask: 'Which coffee drink is this?',
      guidance: 'The picture is a cut through the cup.',
      show: { kind: 'item-image', module: 'coffee-drinks', item: 'cappuccino' },
      answer: 'word',
    },
    {
      id: 'q8',
      // Named rather than shown: the milk pictures are drawings of cartons with
      // no name on them, so a picture would ask the learner to identify the
      // drawing first. The module's own quiz gives the name with the picture.
      ask: 'Which allergen is in oat milk?',
      show: { kind: 'none' },
      answer: 'word',
    },
    {
      id: 'q9',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'flapjack' },
      answer: 'word',
    },
    {
      id: 'q10',
      ask: 'What is the informal name for this bread-based dish?',
      show: { kind: 'product-image', module: 'bread', product: 'butty' },
      answer: 'word',
    },
    {
      id: 'q11',
      ask: 'Which allergen is this?',
      show: { kind: 'item-image', module: 'allergens', item: 'sesame' },
      answer: 'word',
    },
    {
      id: 'q12',
      ask: 'How do you make a mocha?',
      guidance: 'Write one step on each line.',
      show: { kind: 'none' },
      answer: 'list',
    },
    {
      id: 'q13',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'cakes-and-snacks', item: 'millionaires-shortbread' },
      answer: 'word',
    },
    {
      id: 'q14',
      ask: 'Which coffee drink is this?',
      guidance: 'The picture is a cut through the cup.',
      show: { kind: 'item-image', module: 'coffee-drinks', item: 'cortado' },
      answer: 'word',
    },
    {
      id: 'q15',
      ask: 'What is this called?',
      show: { kind: 'item-image', module: 'kitchen-equipment', item: 'saucer' },
      answer: 'word',
    },
    {
      id: 'q16',
      ask: 'What is the name of this bread-based dish?',
      show: { kind: 'product-image', module: 'bread', product: 'panini' },
      answer: 'word',
    },
    {
      id: 'q17',
      ask: 'Which allergen is in almond milk?',
      show: { kind: 'none' },
      answer: 'word',
    },
    {
      id: 'q18',
      ask: 'Which allergen is this?',
      show: { kind: 'item-image', module: 'allergens', item: 'gluten' },
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
