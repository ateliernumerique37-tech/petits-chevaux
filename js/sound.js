'use strict';

// Web Audio API — évite d'ajouter des éléments <audio> au DOM.
// Sur iOS, HTMLAudioElement interfère avec l'arbre d'accessibilité de VoiceOver
// et fait perdre le focus au lecteur d'écran à chaque son joué.
// AudioBuffer n'a aucune présence dans le DOM.

let ctx = null;
const buffers = new Map();   // name -> AudioBuffer décodé (prêt à jouer)
const decoding = new Map();  // name -> Promise<AudioBuffer|null> (décodage en cours)
const fetched = new Map();   // name -> Promise<ArrayBuffer|null> (octets bruts)

const SOUNDS = [
  'dice-roll', 'dice-six', 'move', 'exit-stable',
  'capture', 'home-stretch', 'victory', 'pass-turn', 'pass-phone',
];

// Fetch des MP3 dès le chargement de la page (depuis le cache service worker)
// sans AudioContext — les octets bruts sont prêts avant le premier geste.
export function loadSounds() {
  for (const name of SOUNDS) {
    fetched.set(name,
      fetch(`sounds/${name}.mp3`).then(r => r.arrayBuffer()).catch(() => null)
    );
  }
}

// Décode un son (idempotent). Renvoie une promesse vers l'AudioBuffer (ou null).
function decodeSound(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name));
  if (decoding.has(name)) return decoding.get(name);
  if (!ctx) return Promise.resolve(null);

  const p = (async () => {
    try {
      const raw = await fetched.get(name);
      if (!raw) return null;
      // decodeAudioData « détache » l'ArrayBuffer source : on décode une COPIE
      // pour que les octets bruts restent réutilisables (réessai éventuel).
      const buf = await ctx.decodeAudioData(raw.slice(0));
      buffers.set(name, buf);
      return buf;
    } catch (e) {
      return null;
    }
  })();
  decoding.set(name, p);
  return p;
}

// Doit être appelée depuis un geste utilisateur (obligation iOS pour AudioContext).
// Idempotente : les appels suivants reprennent simplement un contexte suspendu.
export function unlockAudio() {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch (e) { return; }
    // Lance le décodage de tous les sons en arrière-plan
    for (const name of SOUNDS) decodeSound(name);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function playBuffer(buf) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.75;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
}

export function play(name) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const buf = buffers.get(name);
  if (buf) { playBuffer(buf); return; }

  // Buffer pas encore décodé (course au démarrage) : décoder PUIS jouer,
  // au lieu d'abandonner silencieusement le son. Garantit que le son de
  // début de partie est bien entendu même au tout premier déverrouillage.
  decodeSound(name).then(b => {
    if (b && ctx && ctx.state !== 'closed') playBuffer(b);
  });
}
