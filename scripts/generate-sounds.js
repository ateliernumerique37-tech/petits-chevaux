#!/usr/bin/env node
// Run once: node scripts/generate-sounds.js
// Requires Node 18+ (native fetch). Saves MP3s to sounds/

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = join(__dirname, '..', 'sounds');
// La clé API ne doit JAMAIS être en dur dans le code (le dépôt est public).
// La fournir via la variable d'environnement ELEVENLABS_API_KEY :
//   ELEVENLABS_API_KEY=sk_xxx node scripts/generate-sounds.js
const API_KEY = process.env.ELEVENLABS_API_KEY;
const API_URL = 'https://api.elevenlabs.io/v1/sound-generation';

if (!API_KEY) {
  console.error('Erreur : définir la variable d\'environnement ELEVENLABS_API_KEY.');
  process.exit(1);
}

const SOUNDS = [
  {
    name: 'dice-roll',
    text: 'Wooden dice rolling and bouncing on a wooden board game table, short rattling sound',
    duration: 1.5,
  },
  {
    name: 'dice-six',
    text: 'Short triumphant cheerful bell chime, single bright ding for a winner',
    duration: 1.0,
  },
  {
    name: 'move',
    text: 'Light playful clip-clop of a toy horse moving two quick steps on a board',
    duration: 0.8,
  },
  {
    name: 'exit-stable',
    text: 'Small wooden stable door creaking open then a short playful horse whinny',
    duration: 1.5,
  },
  {
    name: 'capture',
    text: 'Dramatic cartoon crash impact with a surprised horse whinny, comedic effect',
    duration: 1.5,
  },
  {
    name: 'home-stretch',
    text: 'Short triumphant two-note ascending fanfare trumpet, victory near sound',
    duration: 1.5,
  },
  {
    name: 'victory',
    text: 'Joyful complete victory fanfare with crowd applause and celebration cheers',
    duration: 4.0,
  },
  {
    name: 'pass-turn',
    text: 'Soft gentle single quiet bell ding, subtle notification sound',
    duration: 0.8,
  },
  {
    name: 'pass-phone',
    text: 'Smooth soft whoosh transition sound, brief and airy',
    duration: 0.8,
  },
];

async function generateSound({ name, text, duration }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      duration_seconds: duration,
      prompt_influence: 0.3,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!existsSync(SOUNDS_DIR)) {
    await mkdir(SOUNDS_DIR, { recursive: true });
  }

  console.log('Génération des bruitages via ElevenLabs...\n');

  for (const sound of SOUNDS) {
    const outPath = join(SOUNDS_DIR, `${sound.name}.mp3`);

    if (existsSync(outPath)) {
      console.log(`  ⏭  ${sound.name}.mp3 déjà présent, ignoré`);
      continue;
    }

    process.stdout.write(`  ⏳ ${sound.name}... `);
    try {
      const buf = await generateSound(sound);
      await writeFile(outPath, buf);
      console.log(`✓ (${Math.round(buf.length / 1024)} Ko)`);
    } catch (err) {
      console.log(`✗ Erreur: ${err.message}`);
    }

    // Avoid rate limiting
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\nTerminé. Bruitages dans sounds/');
}

main();
