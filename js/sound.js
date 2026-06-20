'use strict';

// Web Audio API — évite d'ajouter des éléments <audio> au DOM.
// Sur iOS, HTMLAudioElement interfère avec l'arbre d'accessibilité de VoiceOver
// et fait perdre le focus au lecteur d'écran à chaque son joué.
// AudioBuffer n'a aucune présence dans le DOM.

let ctx = null;
const buffers = new Map();

const SOUNDS = [
  'dice-roll', 'dice-six', 'move', 'exit-stable',
  'capture', 'home-stretch', 'victory', 'pass-turn', 'pass-phone',
];

// Fetch des MP3 dès le chargement de la page (depuis le cache service worker)
// sans AudioContext — les octets bruts sont prêts avant le premier geste.
const fetched = new Map();

export function loadSounds() {
  for (const name of SOUNDS) {
    fetched.set(name,
      fetch(`sounds/${name}.mp3`).then(r => r.arrayBuffer()).catch(() => null)
    );
  }
}

// Doit être appelée depuis un geste utilisateur (obligation iOS pour AudioContext).
// Idempotente : les appels suivants reprennent simplement un contexte suspendu.
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  try { ctx = new AudioContext(); } catch (e) { return; }

  // Décodage en arrière-plan — terminé bien avant le premier play()
  Promise.all(SOUNDS.map(async name => {
    try {
      const raw = await fetched.get(name);
      if (raw) buffers.set(name, await ctx.decodeAudioData(raw));
    } catch (e) {}
  }));
}

export function play(name) {
  if (!ctx || !buffers.has(name)) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(name);
  const gain = ctx.createGain();
  gain.gain.value = 0.75;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
}
