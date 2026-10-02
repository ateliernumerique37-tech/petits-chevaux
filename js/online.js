'use strict';

const NAME_KEY = 'petits-chevaux-player-name';
const HOSTED_KEY = 'petits-chevaux-hosted-room';
const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];

let db = null;
let auth = null;
let currentUser = null;
let currentRoomId = null;
let currentCode = null;
let hostFlag = false;
let cleanupFns = [];

function fb() { return window.firebase; }

export function isFirebaseAvailable() { return !!fb(); }

export function initFirebase() {
  if (db) return;
  const f = fb();
  if (!f) return;
  f.initializeApp({
    apiKey: 'AIzaSyBKEtNjA0JOwUSP1lUjxXWHkkK_pDZPf_c',
    authDomain: 'petits-chevaux-online.firebaseapp.com',
    databaseURL: 'https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'petits-chevaux-online',
    appId: '1:275251725173:web:06839fa2ae3f087a89093c',
  });
  db = f.database();
  auth = f.auth();
}

export async function signIn() {
  if (currentUser) return currentUser;
  initFirebase();
  const cred = await auth.signInAnonymously();
  currentUser = cred.user;
  return currentUser;
}

export function getUid() { return currentUser?.uid || null; }
export function isHost() { return hostFlag; }
export function getCurrentRoomId() { return currentRoomId; }

export function getSavedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch {}
}

function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function rememberHostedRoom(roomId, code) {
  try { localStorage.setItem(HOSTED_KEY, JSON.stringify({ roomId, code })); } catch {}
}

function forgetHostedRoom() {
  try { localStorage.removeItem(HOSTED_KEY); } catch {}
}

// Nettoyage ciblé : supprime une room dont CE joueur est l'hôte et qu'il a
// laissée orpheline (fermeture brutale en pleine partie, où onDisconnect est
// désarmé). Appelé quand il revient en mode en ligne. Conforme aux règles :
// seul l'hôte peut supprimer sa propre room. No-op s'il n'a rien laissé.
export async function sweepOwnOrphanRoom() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(HOSTED_KEY) || 'null'); } catch {}
  if (!saved || !saved.roomId) return;
  try {
    await signIn();
    const roomSnap = await db.ref('rooms/' + saved.roomId).once('value');
    const room = roomSnap.val();
    if (room && room.config && room.config.hostId === currentUser.uid) {
      // Ne PAS supprimer une partie encore habitée : si le statut est
      // « playing » et qu'un adversaire y est toujours, on laisse la room
      // vivre (l'hôte peut s'y reconnecter via joinRoom). On garde la clé
      // pour balayer plus tard si elle devient réellement orpheline.
      const others = Object.keys(room.players || {}).filter(uid => uid !== currentUser.uid);
      if (room.status === 'playing' && others.length > 0) return;
      const updates = {};
      updates['rooms/' + saved.roomId] = null;
      updates['publicRooms/' + saved.roomId] = null;
      if (saved.code) updates['roomCodes/' + saved.code] = null;
      await db.ref().update(updates);
    }
  } catch (e) {}
  forgetHostedRoom();
}

export async function createRoom({ playerName, maxPlayers, isPublic, winMode }) {
  await signIn();
  saveName(playerName);

  const roomRef = db.ref('rooms').push();
  const roomId = roomRef.key;
  const code = isPublic ? null : generateCode();

  const config = {
    hostId: currentUser.uid,
    hostName: playerName,
    maxPlayers,
    public: isPublic,
    createdAt: fb().database.ServerValue.TIMESTAMP,
    winMode: winMode || 'all',
  };
  if (code) config.code = code;

  const updates = {};
  updates['rooms/' + roomId + '/config'] = config;
  updates['rooms/' + roomId + '/status'] = 'waiting';
  updates['rooms/' + roomId + '/players/' + currentUser.uid] = {
    name: playerName,
    color: 'red',
    connected: true,
    lastSeen: fb().database.ServerValue.TIMESTAMP,
  };
  if (isPublic) {
    updates['publicRooms/' + roomId] = {
      hostName: playerName,
      playerCount: 1,
      maxPlayers,
      code: '',
      winMode: winMode || 'all',
    };
  }
  if (code) updates['roomCodes/' + code] = roomId;

  await db.ref().update(updates);

  const playerRef = db.ref('rooms/' + roomId + '/players/' + currentUser.uid);
  playerRef.child('connected').onDisconnect().set(false);
  playerRef.child('lastSeen').onDisconnect().set(fb().database.ServerValue.TIMESTAMP);

  // Si le host ferme le navigateur sans quitter proprement, supprimer la room
  db.ref('rooms/' + roomId).onDisconnect().remove();
  db.ref('publicRooms/' + roomId).onDisconnect().remove();
  if (code) db.ref('roomCodes/' + code).onDisconnect().remove();

  currentRoomId = roomId;
  currentCode = code;
  hostFlag = true;
  rememberHostedRoom(roomId, code); // pour nettoyer si fermeture brutale plus tard
  return { roomId, code };
}

// Désarme la suppression automatique de la room (onDisconnect().remove()).
// À appeler quand la partie démarre : sinon une coupure réseau passagère de
// l'hôte (arrière-plan mobile, wifi↔4G) supprimerait toute la room en pleine
// partie. L'auto-suppression n'est utile que dans le lobby (salon abandonné).
export function disarmRoomAutoDelete() {
  if (!db || !currentRoomId) return;
  try {
    // ATTENTION : cancel() sur un chemin annule aussi les onDisconnect de TOUS
    // ses enfants — y compris les marqueurs de présence du joueur. Il faut donc
    // les re-armer juste après (sinon connected/lastSeen ne se mettent plus à
    // jour en cas de coupure).
    db.ref('rooms/' + currentRoomId).onDisconnect().cancel();
    db.ref('publicRooms/' + currentRoomId).onDisconnect().cancel();
    if (currentCode) db.ref('roomCodes/' + currentCode).onDisconnect().cancel();
    if (currentUser) setupPresence(currentRoomId); // re-armement de la présence
  } catch (e) {}
}

export async function joinRoom(roomId, playerName) {
  await signIn();
  saveName(playerName);

  const roomRef = db.ref('rooms/' + roomId);
  const [configSnap, playersSnap, statusSnap] = await Promise.all([
    roomRef.child('config').once('value'),
    roomRef.child('players').once('value'),
    roomRef.child('status').once('value'),
  ]);

  const config = configSnap.val();
  if (!config) throw new Error('Plateau introuvable.');

  // RECONNEXION D'ABORD : si ce joueur fait déjà partie de la room, il peut
  // toujours revenir — même en pleine partie. (Ce test doit précéder le test
  // de statut, sinon la reconnexion est impossible dès que la partie a démarré.)
  const players = playersSnap.val() || {};
  if (players[currentUser.uid]) {
    await roomRef.child('players/' + currentUser.uid + '/connected').set(true);
    currentRoomId = roomId;
    hostFlag = config.hostId === currentUser.uid;
    if (hostFlag && config.code) currentCode = config.code;
    setupPresence(roomId);
    return { roomId, color: players[currentUser.uid].color, config };
  }

  if (statusSnap.val() !== 'waiting') throw new Error('La partie a déjà commencé.');

  const count = Object.keys(players).length;
  if (count >= config.maxPlayers) throw new Error('Le plateau est complet.');

  const usedColors = new Set(Object.values(players).map(p => p.color));
  const myColor = COLOR_ORDER.find(c => !usedColors.has(c));
  if (!myColor) throw new Error('Plus de couleur disponible.');

  await roomRef.child('players/' + currentUser.uid).set({
    name: playerName,
    color: myColor,
    connected: true,
    lastSeen: fb().database.ServerValue.TIMESTAMP,
  });

  if (config.public) {
    // Transaction : évite la désynchronisation du compteur si deux joueurs
    // rejoignent/quittent en même temps (lecture-puis-écriture non atomique).
    db.ref('publicRooms/' + roomId + '/playerCount')
      .transaction(n => (n === null ? undefined : n + 1))
      .catch(() => {});
  }

  setupPresence(roomId);
  currentRoomId = roomId;
  hostFlag = false;
  return { roomId, color: myColor, config };
}

export async function joinRoomByCode(code, playerName) {
  await signIn();
  const snap = await db.ref('roomCodes/' + code).once('value');
  const roomId = snap.val();
  if (!roomId) throw new Error('Code invalide.');
  return joinRoom(roomId, playerName);
}

function setupPresence(roomId) {
  const playerRef = db.ref('rooms/' + roomId + '/players/' + currentUser.uid);
  playerRef.child('connected').onDisconnect().set(false);
  playerRef.child('lastSeen').onDisconnect().set(fb().database.ServerValue.TIMESTAMP);
}

export function listenPublicRooms(callback) {
  initFirebase();
  if (!db) { callback([]); return () => {}; }
  const ref = db.ref('publicRooms').limitToLast(20);
  const handler = ref.on('value', snap => {
    const rooms = [];
    snap.forEach(child => {
      const val = child.val();
      if (val && val.playerCount < val.maxPlayers) {
        rooms.push({ id: child.key, ...val });
      }
    });
    callback(rooms);
  });
  const unsub = () => ref.off('value', handler);
  cleanupFns.push(unsub);
  return unsub;
}

export function listenRoom(roomId, callbacks) {
  const roomRef = db.ref('rooms/' + roomId);
  const handlers = [];

  if (callbacks.onPlayers) {
    const h = roomRef.child('players').on('value', snap => callbacks.onPlayers(snap.val() || {}));
    handlers.push(() => roomRef.child('players').off('value', h));
  }
  if (callbacks.onStatus) {
    const h = roomRef.child('status').on('value', snap => callbacks.onStatus(snap.val()));
    handlers.push(() => roomRef.child('status').off('value', h));
  }
  if (callbacks.onGameState) {
    const h = roomRef.child('gameState').on('value', snap => callbacks.onGameState(snap.val()));
    handlers.push(() => roomRef.child('gameState').off('value', h));
  }

  cleanupFns.push(...handlers);
  return () => handlers.forEach(fn => fn());
}

export async function writeGameState(gs) {
  if (!currentRoomId) return;
  await db.ref('rooms/' + currentRoomId + '/gameState').set(gs);
}

export async function setRoomStatus(status) {
  if (!currentRoomId) return;
  await db.ref('rooms/' + currentRoomId + '/status').set(status);
  if (status === 'playing' || status === 'finished') {
    db.ref('publicRooms/' + currentRoomId).remove();
  }
}

export async function leaveRoom() {
  if (!currentRoomId || !currentUser) return;

  const roomRef = db.ref('rooms/' + currentRoomId);
  roomRef.child('players/' + currentUser.uid + '/connected').onDisconnect().cancel();
  roomRef.child('players/' + currentUser.uid + '/lastSeen').onDisconnect().cancel();
  roomRef.onDisconnect().cancel();
  db.ref('publicRooms/' + currentRoomId).onDisconnect().cancel();

  const configSnap = await roomRef.child('config').once('value');
  const config = configSnap.val();

  if (config && config.hostId === currentUser.uid) {
    const updates = {};
    updates['rooms/' + currentRoomId] = null;
    updates['publicRooms/' + currentRoomId] = null;
    if (config.code) updates['roomCodes/' + config.code] = null;
    await db.ref().update(updates);
  } else {
    await roomRef.child('players/' + currentUser.uid).remove();
    if (config && config.public) {
      db.ref('publicRooms/' + currentRoomId + '/playerCount')
        .transaction(n => (n === null ? undefined : Math.max(0, n - 1)))
        .catch(() => {});
    }
  }

  forgetHostedRoom(); // room quittée proprement : plus rien à nettoyer plus tard
  cleanupAll();
  currentRoomId = null;
  currentCode = null;
  hostFlag = false;
}

export function cleanupAll() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
}

// ─── Compteurs de parties (anonymes) ─────────────────────────────────────────
// Aucune donnée personnelle : seulement { local, online } par année, incrémenté
// d'une unité à chaque nouvelle partie. Rien n'est lié à un joueur.
//
// File d'attente hors ligne : chaque partie est d'abord inscrite dans le
// localStorage de l'appareil (année + type + id aléatoire local, jamais envoyé),
// puis envoyée au serveur. Si l'envoi échoue (hors ligne, SDK non chargé, limite
// de débit des règles), l'entrée reste en file et repart au prochain lancement,
// au retour du réseau, ou à la prochaine partie.

const COUNTER_KINDS = ['local', 'online'];
const PENDING_KEY = 'petits-chevaux-pending-counts';
const PENDING_MAX = 200;
const inFlight = new Set();
let retryTimer = null;
let retryDelay = 4000;

function readPending() {
  try {
    const a = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

function writePending(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-PENDING_MAX))); } catch {}
}

function sendCount(entry) {
  if (inFlight.has(entry.id)) return Promise.resolve(false);
  inFlight.add(entry.id);
  const TS = fb().database.ServerValue.TIMESTAMP;
  return signIn()
    .then(() => db.ref(`gameCounters/${entry.year}`).transaction(cur => {
      const c = cur && typeof cur === 'object' ? cur : {};
      return {
        local: (Number(c.local) || 0) + (entry.kind === 'local' ? 1 : 0),
        online: (Number(c.online) || 0) + (entry.kind === 'online' ? 1 : 0),
        lastAt: TS,
      };
    }))
    .then(res => {
      if (!res.committed) return false;
      writePending(readPending().filter(e => e.id !== entry.id));
      return true;
    })
    .catch(() => false)
    .finally(() => inFlight.delete(entry.id));
}

// Envoie, une par une, les parties en attente. Les règles Firebase limitent le
// débit : en cas de refus, on réessaie plus tard avec un délai croissant.
export async function flushPendingCounts() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  try {
    initFirebase();
    if (!db) return;
    for (const entry of readPending()) {
      const ok = await sendCount(entry);
      if (!ok) {
        if (retryDelay <= 64000) {
          retryTimer = setTimeout(flushPendingCounts, retryDelay + Math.random() * 1000);
          retryDelay *= 2;
        }
        return;
      }
      retryDelay = 4000;
    }
  } catch {}
}

export function countGame(kind) {
  try {
    if (!COUNTER_KINDS.includes(kind)) return;
    const list = readPending();
    list.push({
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      year: new Date().getFullYear(),
      kind,
    });
    writePending(list);
    flushPendingCounts();
  } catch {}
}

// Retourne { 2026: { local, online }, 2025: {...}, ... } ou null si indisponible.
export async function fetchGameCounters() {
  try {
    initFirebase();
    if (!db) return null;
    const snap = await db.ref('gameCounters').get();
    const raw = snap.val() || {};
    const out = {};
    for (const [year, v] of Object.entries(raw)) {
      out[year] = { local: Number(v?.local) || 0, online: Number(v?.online) || 0 };
    }
    return out;
  } catch { return null; }
}
