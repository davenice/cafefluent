// Sentence variants spoken in the allergen "listen and find" task.
// Keep in sync with VARIANTS in scripts/generate-audio.mjs

export type SentenceVariant = 'allergic' | 'intolerant' | 'must-not-eat' | 'cant-eat' | 'allergy-to' | 'cant-have'

export const SENTENCE_TEMPLATES: Record<SentenceVariant, (name: string) => string> = {
  allergic:       (name) => `I'm allergic to ${name.toLowerCase()}`,
  intolerant:     (name) => `I'm intolerant to ${name.toLowerCase()}`,
  'must-not-eat': (name) => `I must not eat ${name.toLowerCase()}`,
  'cant-eat':     (name) => `I can't eat ${name.toLowerCase()}`,
  'allergy-to':   (name) => `I have an allergy to ${name.toLowerCase()}`,
  'cant-have':    (name) => `I can't have ${name.toLowerCase()}`,
}

export const SENTENCE_VARIANTS: SentenceVariant[] = ['allergic', 'intolerant', 'must-not-eat', 'cant-eat', 'allergy-to', 'cant-have']
