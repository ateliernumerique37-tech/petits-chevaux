'use strict';

const NAME_KEY = 'petits-chevaux-player-name';
const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];

let db = null;
let auth = null;
let currentUser = null;
let currentRoomId = null;
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
  hostFlag = true;
  return { roomId, code };
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
  if (statusSnap.val() !== 'waiting') throw new Error('La partie a déjà commencé.');

  const players = playersSnap.val() || {};
  if (players[currentUser.uid]) {
    await roomRef.child('players/' + currentUser.uid + '/connected').set(true);
    currentRoomId = roomId;
    hostFlag = config.hostId === currentUser.uid;
    setupPresence(roomId);
    return { roomId, color: players[currentUser.uid].color, config };
  }

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
    db.ref('publicRooms/' + roomId + '/playerCount').set(count + 1);
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
      const playersSnap = await roomRef.child('players').once('value');
      db.ref('publicRooms/' + currentRoomId + '/playerCount').set(playersSnap.numChildren());
    }
  }

  cleanupAll();
  currentRoomId = null;
  hostFlag = false;
}

export function cleanupAll() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
}
