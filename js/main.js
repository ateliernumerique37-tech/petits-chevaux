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
} from './ui.js';

let state = null;
let aiPlayers = new Set();
let aiNames = {};            // couleur IA -> prénom (Bernard, Céline, Marie…)
const sessionScores = {};
let shortcutsAnnounced = false;

const AI_NAMES = ['Bernard', 'Céline', 'Marie'];

function playerLabel(color) {
  return aiPlayers.has(color) ? `${aiNames[color]} (${COLOR_NAMES[color]})` : COLOR_NAMES[color];
}

// Position courte d'un cheval, pour le journal visuel ("case 23", "couloir 4", "centre", "écurie")
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

const SHAKE_THRESHOLD = 15; // m/s²
const SHAKE_COOLDOWN  = 1200; // ms entre deux secousses
let lastShake = 0;
let motionListenerAdded = false;

function onDeviceMotion(e) {
  if (!state || state.phase !== 'rolling' || aiPlayers.has(state.currentColor)) return;
  const btn = document.getElementById('btn-dice');
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
    // iOS 13+ : doit être appelé depuis un geste utilisateur
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

  createBoard(document.getElementById('board-container'));

  initSetupScreen(startGame);
  initDiceButton(onDiceClick);
  initWinnerScreen(() => showScreen('setup'));
  initRepeatButton(repeatLastAnnouncement);
  initSituationButton(() => {
    if (!state) return;
    announce(getFullSituation(state));
  });
  initQuitButton(() => {
    state = null;
    showScreen('setup');
  });

  document.addEventListener('keydown', handleKeyboard);

  showScreen('setup');
});

// ─── Keyboard shortcuts (Alt+Shift+key) ──────────────────────────────────────

function handleKeyboard(e) {
  if (!e.altKey || !e.shiftKey) return;
  if (e.ctrlKey || e.metaKey) return;

  switch (e.code) {
    case 'KeyD':
      if (state && state.phase === 'rolling' && !aiPlayers.has(state.currentColor)) {
        e.preventDefault();
        const btn = document.getElementById('btn-dice');
        if (!btn.disabled) onDiceClick();
      }
      break;

    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      if (state && state.phase === 'selecting' && !aiPlayers.has(state.currentColor)) {
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

    case 'KeyQ': // touche 'A' sur AZERTY (position physique Q sur QWERTY)
      e.preventDefault();
      repeatLastAnnouncement();
      break;
  }
}

// ─── Game start ───────────────────────────────────────────────────────────────

function startGame(playerCount, isAiMode, winMode) {
  unlockAudio();
  requestMotionPermission(); // demande permission iOS si nécessaire
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

  if (!shortcutsAnnounced) {
    shortcutsAnnounced = true;
    announce('Raccourcis Alt+Maj disponibles : D pour le dé, 1 à 4 pour un cheval, S pour la situation, A pour répéter.', true);
  }
  beginTurn();
}

// ─── Turn start ───────────────────────────────────────────────────────────────

function beginTurn() {
  state.phase = 'rolling';
  state.lastDice = null;
  state.validMoveIds = [];
  updateTurnBanner(state.currentColor, state.phase, null);

  const colorName = COLOR_NAMES[state.currentColor];
  const summary = getTurnSummary(state);

  if (aiPlayers.has(state.currentColor)) {
    setDiceEnabled(false);
    announce(`${aiNames[state.currentColor]} joue pour ${colorName}. ${summary}.`);
    setTimeout(aiPlayTurn, 1800);
  } else {
    setDiceEnabled(true);
    announce(`Tour de ${colorName}. ${summary}. Lancez le dé.`);
    setTimeout(() => document.getElementById('btn-dice').focus(), 50);
  }
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
      const chosenId = getAIMove(state, value);
      onHorseSelected(chosenId);
    }, 800);
  });
}

// ─── Human dice click ─────────────────────────────────────────────────────────

function onDiceClick() {
  if (state.phase !== 'rolling') return;

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
      setTimeout(() => endTurn(false), 1200);
      return;
    }

    state.phase = 'selecting';

    if (ids.length === 1) {
      announce(`${colorName} lance ${value}. Un seul cheval peut bouger.`);
      const horse = state.horses.find(h => h.color === state.currentColor && h.id === ids[0]);
      updateHorseLabel(state.currentColor, ids[0], getMoveLabel(state, horse, value));
      setTimeout(() => onHorseSelected(ids[0]), 300);
    } else {
      announce(`${colorName} lance ${value}. ${ids.length} chevaux peuvent bouger. Utilisez Tab pour naviguer, Entrée pour choisir.`);
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

  for (const ev of events) {
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
      const replayMsg = aiPlayers.has(ev.byColor) ? `${aiNames[ev.byColor]} rejoue !` : "Vous rejouez !";
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
      logEvent(`${COLOR_NAMES[ev.color]} gagne la partie !`, ev.color);
      const nameMap = {};
      state.players.forEach(c => { nameMap[c] = playerLabel(c); });
      setTimeout(() => {
        play('victory');
        vibrate([100, 50, 100, 50, 300]);
        showWinner(ev.color, sessionScores, nameMap);
      }, 600);
      return;
    }
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
