'use strict';

import {
  createGame, rollDice, getValidMoves, applyMove, advanceTurn,
  COLOR_NAMES, getMoveLabel, applyTripleSixPenalty,
  getTurnSummary, getFullSituation, getAIMove,
  getAbsPos, FINISHED_REL,
} from './game.js';
import {
  createBoard, initHorses, moveHorse, setMovable, clearHighlights, updateHorseLabel,
  markLastMoved, clearLastMoved,
} from './board.js';
import { loadSounds, unlockAudio, play } from './sound.js';
import {
  showScreen, initSetupScreen, initDiceButton,
  updateTurnBanner, setDiceEnabled, animateDice,
  showWinner, initWinnerScreen, announce,
  repeatLastAnnouncement, initRepeatButton, initSituationButton, initQuitButton,
  logEvent, clearEventLog,
  initResumeButton, showResumeButton,
  initStatsScreen, initThemeToggle,
} from './ui.js';
import {
  isFirebaseAvailable, createRoom, joinRoom, joinRoomByCode,
  listenPublicRooms, listenRoom, writeGameState, setRoomStatus,
  leaveRoom, cleanupAll, getUid, isHost, getCurrentRoomId,
  getSavedName, saveName,
} from './online.js';

let state = null;
let aiPlayers = new Set();
let aiNames = {};
const sessionScores = {};
let aiDifficulty = 'normal';
let turnCount = 0;
let gameStartTime = 0;

// ─── Online state ────────────────────────────────────────────────────────────

let isOnline = false;
let myColor = null;
let onlineSeq = -1;
let onlinePlayersMap = {};
let roomUnsub = null;
let onlineName = '';
let lastOnlineAction = null;

const AI_NAMES = ['Bernard', 'Céline', 'Marie'];
const SAVE_KEY = 'petits-chevaux-save';
const STATS_KEY = 'petits-chevaux-stats';

const $ = id => document.getElementById(id);

function playerLabel(color) {
  if (isOnline) return onlinePlayerName(color);
  return aiPlayers.has(color) ? `${aiNames[color]} (${COLOR_NAMES[color]})` : COLOR_NAMES[color];
}

function onlinePlayerName(color) {
  for (const p of Object.values(onlinePlayersMap)) {
    if (p.color === color) return `${p.name} (${COLOR_NAMES[color]})`;
  }
  return COLOR_NAMES[color];
}

// ─── Save / Load / Stats ─────────────────────────────────────────────────────

function saveGame() {
  if (!state || state.phase === 'game-over' || isOnline) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      state, aiPlayers: [...aiPlayers], aiNames,
      sessionScores, turnCount, gameStartTime, aiDifficulty,
    }));
  } catch {}
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function recordStats(winnerColor) {
  try {
    const stats = JSON.parse(localStorage.getItem(STATS_KEY) || '[]');
    stats.push({
      date: new Date().toISOString(),
      winner: winnerColor,
      winnerLabel: playerLabel(winnerColor),
      playerCount: state.players.length,
      aiMode: aiPlayers.size > 0,
      aiDifficulty,
      winMode: state.winMode,
      turns: turnCount,
      duration: Math.round((Date.now() - gameStartTime) / 1000),
      online: isOnline,
    });
    while (stats.length > 100) stats.shift();
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}
}

function cellShort(horse) {
  const r = horse.relPos;
  if (r === -1) return 'écurie';
  if (r === FINISHED_REL) return 'centre';
  if (r >= 52) return `couloir ${r - 51}`;
  return `case ${getAbsPos(horse) + 1}`;
}

// ─── Vibration ────────────────────────────────────────────────────────────────

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ─── Shake to roll ────────────────────────────────────────────────────────────

const SHAKE_THRESHOLD = 15;
const SHAKE_COOLDOWN  = 1200;
let lastShake = 0;
let motionListenerAdded = false;

function onDeviceMotion(e) {
  if (!state || state.phase !== 'rolling' || aiPlayers.has(state.currentColor)) return;
  if (isOnline && state.currentColor !== myColor) return;
  const btn = $('btn-dice');
  if (btn && btn.disabled) return;
  const g = e.accelerationIncludingGravity;
  if (!g) return;
  const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
  const now = Date.now();
  if (mag > SHAKE_THRESHOLD && now - lastShake > SHAKE_COOLDOWN) {
    lastShake = now;
    onDiceClick();
  }
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === 'undefined') return;
  if (motionListenerAdded) return;
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') return;
    } catch (e) { return; }
  }
  window.addEventListener('devicemotion', onDeviceMotion);
  motionListenerAdded = true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  loadSounds();
  initThemeToggle();

  createBoard($('board-container'));

  initSetupScreen(startGame);
  initDiceButton(onDiceClick);
  initWinnerScreen(() => {
    if (isOnline) {
      leaveRoom();
      resetOnline();
    }
    showResumeButton(false);
    showScreen('setup');
  });
  initRepeatButton(repeatLastAnnouncement);
  initSituationButton(() => {
    if (!state) return;
    announce(getFullSituation(state));
  });
  initQuitButton(() => {
    if (isOnline) {
      leaveRoom();
      resetOnline();
    } else {
      clearSave();
    }
    state = null;
    showResumeButton(false);
    showScreen('setup');
  });
  initResumeButton(resumeGame);
  initStatsScreen(() => showScreen('setup'));
  initOnlineScreens();

  document.addEventListener('keydown', handleKeyboard);

  showResumeButton(!!loadSave());
  showScreen('setup');
});

// ─── Keyboard shortcuts (Alt+Shift+key) ──────────────────────────────────────

function handleKeyboard(e) {
  if (!e.altKey || !e.shiftKey) return;
  if (e.ctrlKey || e.metaKey) return;

  switch (e.code) {
    case 'KeyD':
      if (state && state.phase === 'rolling' && !aiPlayers.has(state.currentColor)) {
        if (isOnline && state.currentColor !== myColor) break;
        e.preventDefault();
        const btn = $('btn-dice');
        if (!btn.disabled) onDiceClick();
      }
      break;

    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      if (state && state.phase === 'selecting' && !aiPlayers.has(state.currentColor)) {
        if (isOnline && state.currentColor !== myColor) break;
        e.preventDefault();
        const id = parseInt(e.code.replace('Digit', '')) - 1;
        if (state.validMoveIds.includes(id)) onHorseSelected(id);
      }
      break;

    case 'KeyS':
      if (state) {
        e.preventDefault();
        announce(getFullSituation(state));
      }
      break;

    case 'KeyQ':
      e.preventDefault();
      repeatLastAnnouncement();
      break;
  }
}

// ─── Game start (local) ──────────────────────────────────────────────────────

function startGame(playerCount, isAiMode, winMode, difficulty) {
  unlockAudio();
  requestMotionPermission();
  isOnline = false;
  myColor = null;
  aiDifficulty = difficulty || 'normal';
  turnCount = 0;
  gameStartTime = Date.now();
  state = createGame(playerCount, winMode);

  aiPlayers = new Set();
  aiNames = {};
  if (isAiMode) {
    state.players.slice(1).forEach((color, i) => {
      aiPlayers.add(color);
      aiNames[color] = AI_NAMES[i] || `IA ${i + 1}`;
    });
  }

  state.players.forEach(color => {
    if (!(color in sessionScores)) sessionScores[color] = 0;
  });

  initHorses(state.horses);
  clearEventLog();
  showScreen('game');

  play('exit-stable'); // signal sonore de début de partie (chevaux en piste)
  beginTurn();
}

// ─── Resume saved game ───────────────────────────────────────────────────────

function resumeGame() {
  const data = loadSave();
  if (!data) return;

  unlockAudio();
  requestMotionPermission();

  state = data.state;
  aiPlayers = new Set(data.aiPlayers || []);
  aiNames = data.aiNames || {};
  Object.assign(sessionScores, data.sessionScores || {});
  turnCount = data.turnCount || 0;
  gameStartTime = data.gameStartTime || Date.now();
  aiDifficulty = data.aiDifficulty || 'normal';

  initHorses(state.horses);
  clearEventLog();
  showScreen('game');

  state.phase = 'rolling';
  state.lastDice = null;
  state.validMoveIds = [];

  announce('Partie reprise.', true);
  beginTurn();
}

// ─── Turn start ───────────────────────────────────────────────────────────────

function beginTurn() {
  turnCount++;
  state.phase = 'rolling';
  state.lastDice = null;
  state.validMoveIds = [];
  updateTurnBanner(state.currentColor, state.phase, null);

  // ── Online: sync turn start ──
  if (isOnline) {
    const detail = lastOnlineAction
      ? { prevType: lastOnlineAction.type, prevColor: lastOnlineAction.color, prevEvents: lastOnlineAction.events }
      : {};
    lastOnlineAction = null;
    syncOnlineState('turn-start', detail);

    if (state.currentColor !== myColor) {
      setDiceEnabled(false);
      announce(`Tour de ${onlinePlayerName(state.currentColor)}.`);
      return;
    }

    setDiceEnabled(true);
    const summary = getTurnSummary(state);
    announce(`Votre tour ! ${summary}. Lancez le dé.`);
    setTimeout(() => $('btn-dice').focus(), 50);
    return;
  }

  // ── Local / AI ──
  const colorName = COLOR_NAMES[state.currentColor];
  const summary = getTurnSummary(state);

  if (aiPlayers.has(state.currentColor)) {
    setDiceEnabled(false);
    announce(`${aiNames[state.currentColor]} joue pour ${colorName}.`);
    setTimeout(aiPlayTurn, 1800);
  } else {
    setDiceEnabled(true);
    announce(`Tour de ${colorName}. ${summary}. Lancez le dé.`);
    setTimeout(() => $('btn-dice').focus(), 50);
  }

  saveGame();
}

// ─── AI play logic ────────────────────────────────────────────────────────────

function aiPlayTurn() {
  play('dice-roll');
  vibrate(50);
  const value = rollDice();
  state.lastDice = value;

  animateDice(value, () => {
    if (value === 6) state.consecutiveSixes++;
    else state.consecutiveSixes = 0;

    logEvent(`${COLOR_NAMES[state.currentColor]} lance ${value}`, state.currentColor);

    if (state.consecutiveSixes >= 3) {
      state.consecutiveSixes = 0;
      play('pass-turn');
      vibrate([200, 100, 200]);
      updateTurnBanner(state.currentColor, state.phase, value);
      const penalized = applyTripleSixPenalty(state);
      if (penalized) {
        moveHorse(penalized);
        markLastMoved(state.currentColor, penalized.id);
        announce(
          `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne à l'écurie. Tour de ${aiNames[state.currentColor]} perdu.`,
          true
        );
        logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6 ! cheval ${penalized.id + 1} → écurie`, state.currentColor);
      } else {
        announce(`Trois 6 de suite ! Tour de ${aiNames[state.currentColor]} perdu.`, true);
        logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6, tour perdu`, state.currentColor);
      }
      setTimeout(() => endTurn(false), 2000);
      return;
    }

    if (value === 6) { play('dice-six'); vibrate([80, 40, 80]); }

    const ids = getValidMoves(state, value);
    state.validMoveIds = ids;
    updateTurnBanner(state.currentColor, state.phase, value);

    if (ids.length === 0) {
      announce(`${playerLabel(state.currentColor)} lance ${value}. Aucun mouvement possible.`, true);
      logEvent(`${COLOR_NAMES[state.currentColor]} : aucun mouvement`, state.currentColor);
      play('pass-turn');
      vibrate([30, 30, 30]);
      setTimeout(() => endTurn(false), 1200);
      return;
    }

    state.phase = 'selecting';
    announce(`${playerLabel(state.currentColor)} lance ${value}.`);

    setTimeout(() => {
      const chosenId = getAIMove(state, value, aiDifficulty);
      onHorseSelected(chosenId);
    }, 800);
  });
}

// ─── Human dice click ─────────────────────────────────────────────────────────

function onDiceClick() {
  if (state.phase !== 'rolling') return;
  if (isOnline && state.currentColor !== myColor) return;

  unlockAudio();
  setDiceEnabled(false);
  play('dice-roll');
  vibrate(50);

  const value = rollDice();
  state.lastDice = value;

  animateDice(value, () => {
    if (value === 6) state.consecutiveSixes++;
    else state.consecutiveSixes = 0;

    logEvent(`${COLOR_NAMES[state.currentColor]} lance ${value}`, state.currentColor);

    if (state.consecutiveSixes >= 3) {
      state.consecutiveSixes = 0;
      play('pass-turn');
      vibrate([200, 100, 200]);
      updateTurnBanner(state.currentColor, state.phase, value);
      const penalized = applyTripleSixPenalty(state);
      if (penalized) {
        moveHorse(penalized);
        markLastMoved(state.currentColor, penalized.id);
        announce(
          `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne à l'écurie. Tour perdu.`,
          true
        );
        logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6 ! cheval ${penalized.id + 1} → écurie`, state.currentColor);
      } else {
        announce(`Trois 6 de suite ! Tour perdu.`, true);
        logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6, tour perdu`, state.currentColor);
      }
      if (isOnline) lastOnlineAction = { type: 'penalty', color: state.currentColor, events: ['penalty'] };
      setTimeout(() => endTurn(false), 2000);
      return;
    }

    if (value === 6) { play('dice-six'); vibrate([80, 40, 80]); }

    const ids = getValidMoves(state, value);
    state.validMoveIds = ids;

    const colorName = COLOR_NAMES[state.currentColor];
    updateTurnBanner(state.currentColor, state.phase, value);

    if (ids.length === 0) {
      announce(`${colorName} lance ${value}. Aucun mouvement possible.`, true);
      logEvent(`${colorName} : aucun mouvement`, state.currentColor);
      play('pass-turn');
      vibrate([30, 30, 30]);
      if (isOnline) lastOnlineAction = { type: 'pass', color: state.currentColor, events: [] };
      setTimeout(() => endTurn(false), 1200);
      return;
    }

    state.phase = 'selecting';

    // Sync dice result for remote clients
    if (isOnline) syncOnlineState('dice', { dice: value, playerColor: state.currentColor });

    if (ids.length === 1) {
      announce(`${colorName} lance ${value}. Un seul cheval peut bouger.`);
      const horse = state.horses.find(h => h.color === state.currentColor && h.id === ids[0]);
      updateHorseLabel(state.currentColor, ids[0], getMoveLabel(state, horse, value));
      setTimeout(() => onHorseSelected(ids[0]), 300);
    } else {
      announce(`${colorName} lance ${value}. ${ids.length} chevaux peuvent bouger.`);
      ids.forEach(id => {
        const horse = state.horses.find(h => h.color === state.currentColor && h.id === id);
        updateHorseLabel(state.currentColor, id, getMoveLabel(state, horse, value));
      });
      setMovable(state.currentColor, ids, onHorseSelected);
    }
  });
}

// ─── Horse selected (human or AI) ────────────────────────────────────────────

function onHorseSelected(horseId) {
  if (state.phase !== 'selecting') return;
  state.phase = 'animating';

  clearHighlights();
  setDiceEnabled(false);

  const dice = state.lastDice;
  const events = applyMove(state, horseId, dice);

  let hadCapture = false;
  let moverCell = '';
  const eventTypes = [];

  for (const ev of events) {
    eventTypes.push(ev.type);
    if (ev.type === 'exit-stable' || ev.type === 'move') {
      const horse = state.horses.find(h => h.color === ev.color && h.id === ev.horseId);
      moveHorse(horse);
      markLastMoved(ev.color, ev.horseId);
      if (ev.bounced) {
        play('move');
        vibrate([30, 20, 30]);
        moverCell = `couloir ${horse.relPos - 51}`;
        announce(
          `Rebond ! Cheval ${COLOR_NAMES[ev.color]} ${ev.horseId + 1} recule à la case ${horse.relPos - 51} du couloir.`
        );
        logEvent(`${COLOR_NAMES[ev.color]} : cheval ${ev.horseId + 1} rebond → ${moverCell}`, ev.color);
      } else {
        play(ev.type);
        vibrate(ev.type === 'exit-stable' ? 80 : 30);
        moverCell = cellShort(horse);
        logEvent(`${COLOR_NAMES[ev.color]} : cheval ${ev.horseId + 1} → ${moverCell}`, ev.color);
      }
    }
    if (ev.type === 'capture') {
      hadCapture = true;
      const captured = state.horses.find(h => h.color === ev.capturedColor && h.id === ev.capturedId);
      moveHorse(captured);
      play('capture');
      vibrate([100, 50, 150]);
      const replayMsg = (isOnline && ev.byColor === myColor) || (!isOnline && !aiPlayers.has(ev.byColor))
        ? 'Vous rejouez !'
        : `${playerLabel(ev.byColor)} rejoue !`;
      announce(
        `Capture ! Cheval ${COLOR_NAMES[ev.capturedColor]} renvoyé à l'écurie. ${replayMsg}`,
        true
      );
      logEvent(
        `${COLOR_NAMES[ev.byColor]} capture ${COLOR_NAMES[ev.capturedColor]}${moverCell ? ' (' + moverCell + ')' : ''}`,
        ev.byColor, true
      );
    }
    if (ev.type === 'home-stretch') {
      play('home-stretch');
      vibrate([50, 30, 50]);
      announce(`${playerLabel(ev.color)} entre dans le couloir d'arrivée !`);
    }
    if (ev.type === 'win') {
      sessionScores[ev.color] = (sessionScores[ev.color] || 0) + 1;
      recordStats(ev.color);
      clearSave();
      logEvent(`${COLOR_NAMES[ev.color]} gagne la partie !`, ev.color);
      const nameMap = {};
      state.players.forEach(c => { nameMap[c] = playerLabel(c); });

      if (isOnline) {
        syncOnlineState('win', { winner: ev.color });
        setRoomStatus('finished');
      }

      setTimeout(() => {
        play('victory');
        vibrate([100, 50, 100, 50, 300]);
        showWinner(ev.color, isOnline ? {} : sessionScores, nameMap);
      }, 600);
      return;
    }
  }

  if (isOnline) {
    lastOnlineAction = { type: 'move', color: state.currentColor, events: eventTypes };
  }

  const extraTurn = dice === 6 || hadCapture;
  setTimeout(() => endTurn(extraTurn), 600);
}

// ─── End of turn ──────────────────────────────────────────────────────────────

function endTurn(extraTurn) {
  if (extraTurn) {
    announce(`${playerLabel(state.currentColor)} rejoue !`);
    beginTurn();
    return;
  }

  advanceTurn(state);
  beginTurn();
}

// ─── Online sync ──────────────────────────────────────────────────────────────

function syncOnlineState(actionType, detail = {}) {
  if (!isOnline) return;
  onlineSeq++;
  writeGameState({
    horses: state.horses.map(h => ({ color: h.color, id: h.id, relPos: h.relPos })),
    currentColor: state.currentColor,
    phase: state.phase,
    lastDice: state.lastDice,
    consecutiveSixes: state.consecutiveSixes || 0,
    validMoveIds: state.validMoveIds || [],
    players: state.players,
    winMode: state.winMode,
    seq: onlineSeq,
    lastAction: { type: actionType, uid: getUid(), ...detail },
  });
}

function onRemoteGameState(gs) {
  if (!gs || !isOnline || !state) return;
  if (gs.seq <= onlineSeq) return;
  onlineSeq = gs.seq;

  const isMyAction = gs.lastAction && gs.lastAction.uid === getUid();
  if (isMyAction) return;

  // Update local state from Firebase
  for (const gh of gs.horses) {
    const h = state.horses.find(x => x.color === gh.color && x.id === gh.id);
    if (h) h.relPos = gh.relPos;
  }
  state.currentColor = gs.currentColor;
  state.phase = gs.phase;
  state.lastDice = gs.lastDice;
  state.consecutiveSixes = gs.consecutiveSixes || 0;
  state.validMoveIds = gs.validMoveIds || [];

  // Re-render all horses
  state.horses.forEach(h => moveHorse(h));
  updateTurnBanner(state.currentColor, state.phase, state.lastDice);

  const action = gs.lastAction;

  // Play feedback for remote actions
  if (action) {
    if (action.type === 'dice') {
      play('dice-roll');
      vibrate(50);
      if (action.dice === 6) { play('dice-six'); vibrate([80, 40, 80]); }
      const name = onlinePlayerName(action.playerColor || gs.currentColor);
      announce(`${name} lance ${action.dice}.`);
      logEvent(`${COLOR_NAMES[action.playerColor || gs.currentColor]} lance ${action.dice}`, action.playerColor || gs.currentColor);
    }

    if (action.type === 'turn-start' && action.prevType) {
      if (action.prevEvents) {
        for (const et of action.prevEvents) {
          if (et === 'capture') play('capture');
          else if (et === 'home-stretch') play('home-stretch');
          else if (et === 'exit-stable') play('exit-stable');
          else if (et === 'move' || et === 'exit-stable') play('move');
        }
      }
      if (action.prevType === 'pass') {
        play('pass-turn');
        logEvent(`${COLOR_NAMES[action.prevColor]} : aucun mouvement`, action.prevColor);
      }
      if (action.prevType === 'penalty') {
        play('pass-turn');
        logEvent(`${COLOR_NAMES[action.prevColor]} : trois 6, tour perdu`, action.prevColor);
      }
      if (action.prevType === 'move') {
        logEvent(`${COLOR_NAMES[action.prevColor]} a joué`, action.prevColor);
      }
    }

    if (action.type === 'win') {
      play('victory');
      vibrate([100, 50, 100, 50, 300]);
      const nameMap = {};
      state.players.forEach(c => { nameMap[c] = onlinePlayerName(c); });
      showWinner(action.winner, {}, nameMap);
      return;
    }
  }

  // Check if it's now my turn
  if (state.currentColor === myColor && state.phase === 'rolling') {
    setDiceEnabled(true);
    const summary = getTurnSummary(state);
    announce(`Votre tour ! ${summary}. Lancez le dé.`);
    setTimeout(() => $('btn-dice').focus(), 50);
  }
}

// ─── Online screens ──────────────────────────────────────────────────────────

function showOnlineError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideOnlineError(id) {
  const el = $(id);
  if (el) el.hidden = true;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

let publicRoomsUnsub = null;

function initOnlineScreens() {
  const onlineBtn = $('btn-online');
  if (!onlineBtn) return;

  onlineBtn.addEventListener('click', () => {
    if (!isFirebaseAvailable()) {
      announce('Mode en ligne indisponible hors connexion.', true);
      return;
    }
    $('online-name').value = getSavedName();
    hideOnlineError('online-error');
    showScreen('online-menu');
  });

  $('btn-online-back').addEventListener('click', () => showScreen('setup'));

  $('btn-create-room').addEventListener('click', () => {
    const name = $('online-name').value.trim();
    if (!name) { showOnlineError('online-error', 'Entrez un pseudo.'); return; }
    onlineName = name;
    hideOnlineError('create-error');
    showScreen('online-create');
  });

  $('btn-join-room').addEventListener('click', () => {
    const name = $('online-name').value.trim();
    if (!name) { showOnlineError('online-error', 'Entrez un pseudo.'); return; }
    onlineName = name;
    hideOnlineError('join-error');
    showScreen('online-join');
    startPublicRoomsListener();
  });

  $('btn-create-cancel').addEventListener('click', () => showScreen('online-menu'));
  $('btn-create-confirm').addEventListener('click', onCreateRoom);
  $('btn-join-back').addEventListener('click', () => { stopPublicRoomsListener(); showScreen('online-menu'); });
  $('btn-join-code').addEventListener('click', onJoinByCode);
  $('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') onJoinByCode(); });
  $('btn-lobby-leave').addEventListener('click', onLeaveLobby);
  $('btn-lobby-start').addEventListener('click', onStartOnlineGame);

  // Garder le curseur sur le select après sélection (mobile / lecteur d'écran)
  ['online-max-players', 'online-visibility', 'online-win-mode'].forEach(id => {
    const sel = $(id);
    if (sel) sel.addEventListener('change', () => sel.focus());
  });
}

function startPublicRoomsListener() {
  stopPublicRoomsListener();
  publicRoomsUnsub = listenPublicRooms(rooms => {
    const list = $('public-rooms-list');
    if (rooms.length === 0) {
      list.innerHTML = '<p class="public-rooms-empty">Aucun plateau disponible.</p>';
      return;
    }
    list.innerHTML = '';
    for (const room of rooms) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'public-room-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML =
        `<span class="public-room-host">${esc(room.hostName)}</span>` +
        `<span class="public-room-info">${room.playerCount}/${room.maxPlayers}</span>`;
      item.addEventListener('click', () => onJoinPublicRoom(room.id));
      list.appendChild(item);
    }
  });
}

function stopPublicRoomsListener() {
  if (publicRoomsUnsub) { publicRoomsUnsub(); publicRoomsUnsub = null; }
}

async function onCreateRoom() {
  const btn = $('btn-create-confirm');
  btn.disabled = true;
  hideOnlineError('create-error');
  try {
    const result = await createRoom({
      playerName: onlineName,
      maxPlayers: parseInt($('online-max-players').value, 10),
      isPublic: $('online-visibility').value === 'public',
      winMode: $('online-win-mode').value,
    });
    enterLobby(result.roomId, result.code, 'red');
  } catch (err) {
    showOnlineError('create-error', err.message || 'Erreur de création.');
  } finally {
    btn.disabled = false;
  }
}

async function onJoinByCode() {
  const code = $('join-code').value.trim();
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    showOnlineError('join-error', 'Entrez un code à 6 chiffres.');
    return;
  }
  hideOnlineError('join-error');
  try {
    const result = await joinRoomByCode(code, onlineName);
    stopPublicRoomsListener();
    enterLobby(result.roomId, null, result.color);
  } catch (err) {
    showOnlineError('join-error', err.message || 'Impossible de rejoindre.');
  }
}

async function onJoinPublicRoom(roomId) {
  hideOnlineError('join-error');
  try {
    const result = await joinRoom(roomId, onlineName);
    stopPublicRoomsListener();
    enterLobby(result.roomId, null, result.color);
  } catch (err) {
    showOnlineError('join-error', err.message || 'Impossible de rejoindre.');
  }
}

const COLOR_PAL = { red: '#c62828', green: '#2e7d32', yellow: '#f57f17', blue: '#1565c0' };

function enterLobby(roomId, code, color) {
  myColor = color;

  if (code) {
    $('lobby-code').hidden = false;
    $('lobby-code-value').textContent = code;
  } else {
    $('lobby-code').hidden = true;
  }

  $('btn-lobby-start').hidden = !isHost();
  $('btn-lobby-start').disabled = true;

  showScreen('online-lobby');

  roomUnsub = listenRoom(roomId, {
    onPlayers: players => {
      onlinePlayersMap = players;
      renderLobbyPlayers(players);
      const count = Object.keys(players).length;
      if (isHost()) {
        $('btn-lobby-start').disabled = count < 2;
        $('lobby-status').textContent = count < 2
          ? 'En attente d\'un autre joueur…'
          : `${count} joueurs connectés. Prêt !`;
      } else {
        $('lobby-status').textContent = `${count} joueurs connectés. En attente du lancement…`;
      }
    },
    onStatus: status => {
      if (status === null) {
        announce('Le plateau a été supprimé.', true);
        resetOnline();
        showScreen('setup');
      }
    },
    onGameState: gs => {
      if (!gs) return;
      if (!state) {
        initOnlineGameFromState(gs);
      } else {
        onRemoteGameState(gs);
      }
    },
  });
}

function renderLobbyPlayers(players) {
  const container = $('lobby-players');
  container.innerHTML = '';
  const uid = getUid();

  for (const [pid, p] of Object.entries(players)) {
    const div = document.createElement('div');
    div.className = 'lobby-player';
    div.setAttribute('role', 'listitem');

    const dot = document.createElement('span');
    dot.className = 'lobby-player-dot';
    dot.style.background = COLOR_PAL[p.color] || '#888';
    div.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'lobby-player-name';
    name.textContent = `${p.name} — ${COLOR_NAMES[p.color]}`;
    div.appendChild(name);

    if (pid === uid) {
      const tag = document.createElement('span');
      tag.className = 'lobby-player-tag you';
      tag.textContent = 'Vous';
      div.appendChild(tag);
    }

    container.appendChild(div);
  }
}

async function onStartOnlineGame() {
  if (!isHost()) return;

  const players = Object.values(onlinePlayersMap);
  const playerCount = players.length;
  if (playerCount < 2) return;

  unlockAudio();
  requestMotionPermission();

  isOnline = true;
  turnCount = 0;
  gameStartTime = Date.now();
  aiPlayers = new Set();
  aiNames = {};
  aiDifficulty = 'normal';
  onlineSeq = -1;
  lastOnlineAction = null;

  // Read win mode from room config — host stored it during create
  const winMode = $('online-win-mode')?.value || 'all';
  state = createGame(playerCount, winMode);

  state.players.forEach(color => {
    if (!(color in sessionScores)) sessionScores[color] = 0;
  });

  initHorses(state.horses);
  clearEventLog();
  showScreen('game');

  play('exit-stable'); // signal sonore de début de partie
  await setRoomStatus('playing');
  beginTurn();
}

function initOnlineGameFromState(gs) {
  unlockAudio();
  requestMotionPermission();

  isOnline = true;
  turnCount = 0;
  gameStartTime = Date.now();
  aiPlayers = new Set();
  aiNames = {};
  aiDifficulty = 'normal';
  onlineSeq = gs.seq || 0;
  lastOnlineAction = null;

  state = {
    players: gs.players,
    horses: gs.horses.map(h => ({ color: h.color, id: h.id, relPos: h.relPos })),
    currentColor: gs.currentColor,
    phase: gs.phase,
    lastDice: gs.lastDice,
    consecutiveSixes: gs.consecutiveSixes || 0,
    validMoveIds: gs.validMoveIds || [],
    winMode: gs.winMode,
  };

  initHorses(state.horses);
  clearEventLog();
  showScreen('game');

  play('exit-stable'); // signal sonore de début de partie
  updateTurnBanner(state.currentColor, state.phase, null);

  if (state.currentColor === myColor && state.phase === 'rolling') {
    setDiceEnabled(true);
    announce('La partie commence ! Votre tour, lancez le dé.');
    setTimeout(() => $('btn-dice').focus(), 50);
  } else {
    setDiceEnabled(false);
    announce(`La partie commence ! Tour de ${onlinePlayerName(state.currentColor)}.`);
  }
}

async function onLeaveLobby() {
  if (roomUnsub) { roomUnsub(); roomUnsub = null; }
  await leaveRoom();
  resetOnline();
  showScreen('online-menu');
}

function resetOnline() {
  isOnline = false;
  myColor = null;
  onlineSeq = -1;
  onlinePlayersMap = {};
  lastOnlineAction = null;
  state = null;
  if (roomUnsub) { roomUnsub(); roomUnsub = null; }
  cleanupAll();
}
