#!/usr/bin/env node
/**
 * Generate TTS audio files for module content using AWS Polly.
 *
 * Usage:
 *   node scripts/generate-audio.mjs [--module=<id>] [--force]
 *
 * --module=<id>  Only process the named module (default: all modules)
 * --force        Regenerate files that already exist
 *
 * Requires AWS credentials (env vars or ~/.aws/credentials) and AWS_REGION set.
 *
 * Output:
 *   public/content/<module>/audio/<id>_<variant>.mp3
 *   public/content/<module>/audio/manifest.json
 *
 * To add a spoken-name override for an item (e.g. to handle slashes or
 * abbreviations), add an "audioName" field to the item in data.json.
 *
 * For words the voice mispronounces (foreign names, say), add an "audioSsml"
 * field instead: an SSML fragment that replaces the name wherever it is spoken,
 * e.g. <phoneme alphabet="ipa" ph="pæn əʊ ˈʃɒkəlɑː">pain au chocolat</phoneme>.
 * The request is then sent as SSML. "audioName" is still used as the plain-text
 * form recorded in the manifest.
 *
 * Diagram hotspots (data.json "diagrams[].hotspots") also get a clip each:
 *   public/content/<module>/audio/<hotspotId>_name.mp3
 * spoken from the hotspot's "label" (or "audioName" if present). Only the
 * "name" variant is generated for hotspots.
 *
 * To add new phrase variants for sentence tasks, add entries to VARIANTS below:
 *   allergic: (name) => `I'm allergic to ${name}`,
 */

import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const VOICE_ID = 'Amy';
const ENGINE = 'neural';
const SAMPLE_RATE = '22050';

// Each key becomes the variant name and determines the output filename suffix.
// Add sentence variants here when Tasks 3+ are implemented.
const VARIANTS = {
  name:           (audioName) => audioName,
  // Sentence variants for Task 3 — keep in sync with DISPLAY_TEMPLATES in src/components/quiz/SentenceMatch.tsx
  allergic:       (audioName) => `I'm allergic to ${audioName}`,
  intolerant:     (audioName) => `I'm intolerant to ${audioName}`,
  'must-not-eat': (audioName) => `I must not eat ${audioName}`,
  'cant-eat':     (audioName) => `I can't eat ${audioName}`,
  'allergy-to':   (audioName) => `I have an allergy to ${audioName}`,
  'cant-have':    (audioName) => `I can't have ${audioName}`,
};

async function generateModule(moduleId, force) {
  const dataPath = join(ROOT, 'public/content', moduleId, 'data.json');
  if (!existsSync(dataPath)) {
    console.error(`  No data.json found — skipping module: ${moduleId}`);
    return;
  }

  const moduleData = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const { items = [], diagrams = [] } = moduleData;
  const activeVariants = moduleData.variants
    ? Object.fromEntries(Object.entries(VARIANTS).filter(([k]) => moduleData.variants.includes(k)))
    : VARIANTS;
  const nameOnly = { name: VARIANTS.name };
  const audioDir = join(ROOT, 'public/content', moduleId, 'audio');
  mkdirSync(audioDir, { recursive: true });

  const manifestPath = join(audioDir, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf-8'))
    : { voice: VOICE_ID, engine: ENGINE, sampleRate: SAMPLE_RATE, items: [] };

  // Index existing manifest entries so we can update in-place
  const manifestIndex = new Map(manifest.items.map((e, i) => [`${e.id}:${e.variant}`, i]));

  const client = new PollyClient({});
  let generated = 0;
  let skipped = 0;

  // Every clip to produce: module items get all active variants, diagram
  // hotspots get just their label.
  const jobs = [
    ...items.map(item => ({ id: item.id, spokenName: item.audioName ?? item.name, ssmlName: item.audioSsml, variants: activeVariants })),
    ...diagrams.flatMap(d => d.hotspots.map(h => ({ id: h.id, spokenName: h.audioName ?? h.label, ssmlName: h.audioSsml, variants: nameOnly }))),
  ];

  for (const item of jobs) {
    const { spokenName, ssmlName } = item;

    for (const [variant, getText] of Object.entries(item.variants)) {
      const filename = `${item.id}_${variant}.mp3`;
      const outputPath = join(audioDir, filename);

      if (!force && existsSync(outputPath)) {
        skipped++;
        continue;
      }

      const text = getText(spokenName);
      const ssml = ssmlName ? `<speak>${getText(ssmlName)}</speak>` : undefined;
      console.log(`  ${filename} — "${text}"${ssml ? ` (ssml: ${ssml})` : ''}`);

      const response = await client.send(new SynthesizeSpeechCommand({
        Text: ssml ?? text,
        TextType: ssml ? 'ssml' : 'text',
        VoiceId: VOICE_ID,
        Engine: ENGINE,
        OutputFormat: 'mp3',
        SampleRate: SAMPLE_RATE,
      }));

      const chunks = [];
      for await (const chunk of response.AudioStream) {
        chunks.push(chunk);
      }
      writeFileSync(outputPath, Buffer.concat(chunks));
      generated++;

      const entry = { id: item.id, variant, text, ...(ssml ? { ssml } : {}), file: filename };
      const idx = manifestIndex.get(`${item.id}:${variant}`);
      if (idx !== undefined) {
        manifest.items[idx] = entry;
      } else {
        manifest.items.push(entry);
        manifestIndex.set(`${item.id}:${variant}`, manifest.items.length - 1);
      }
    }
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[${moduleId}] ${generated} generated, ${skipped} skipped`);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const moduleArg = args.find(a => a.startsWith('--module='))?.split('=')[1];

const modules = moduleArg
  ? [moduleArg]
  : readdirSync(join(ROOT, 'public/content'), { withFileTypes: true })
      .filter(d => d.isDirectory() && existsSync(join(ROOT, 'public/content', d.name, 'data.json')))
      .map(d => d.name);

for (const mod of modules) {
  console.log(`Generating audio for module: ${mod}`);
  await generateModule(mod, force);
}
