'use strict';

import {
  createGame, rollDice, getValidMoves, applyMove, advanceTurn,
  COLOR_NAMES, getMoveLabel, applyTripleSixPenalty,
  getTurnSummary, getFullSituation, getAIMove,
} from './game.js';
import { createBoard, initHorses, moveHorse, setMovable, clearHighlights, updateHorseLabel } from './board.js';
import { loadSounds, unlockAudio, play } from './sound.js';
import {
  showScreen, initSetupScreen, initDiceButton,
  updateTurnBanner, setDiceEnabled, animateDice,
  showWinner, initWinnerScreen, announce,
  repeatLastAnnouncement, initRepeatButton, initSituationButton,
} from './ui.js';

let state = null;
let aiPlayers = new Set();
const sessionScores = {};
let shortcutsAnnounced = false;

const AI_NAME = 'Bernard';

function playerLabel(color) {
  return aiPlayers.has(color) ? `${AI_NAME} (${COLOR_NAMES[color]})` : COLOR_NAMES[color];
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

function startGame(playerCount, isAiMode) {
  unlockAudio();
  state = createGame(playerCount);

  aiPlayers = new Set();
  if (isAiMode) {
    state.players.slice(1).forEach(color => aiPlayers.add(color));
  }

  state.players.forEach(color => {
    if (!(color in sessionScores)) sessionScores[color] = 0;
  });

  initHorses(state.horses);
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
    announce(`${AI_NAME} joue pour ${colorName}. ${summary}.`);
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
  const value = rollDice();
  state.lastDice = value;

  animateDice(value, () => {
    if (value === 6) state.consecutiveSixes++;
    else state.consecutiveSixes = 0;

    if (state.consecutiveSixes >= 3) {
      state.consecutiveSixes = 0;
      play('pass-turn');
      updateTurnBanner(state.currentColor, state.phase, value);
      const penalized = applyTripleSixPenalty(state);
      if (penalized) {
        moveHorse(penalized);
        announce(
          `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne à l'écurie. Tour de ${AI_NAME} perdu.`,
          true
        );
      } else {
        announce(`Trois 6 de suite ! Tour de ${AI_NAME} perdu.`, true);
      }
      setTimeout(() => endTurn(false), 2000);
      return;
    }

    if (value === 6) play('dice-six');

    const ids = getValidMoves(state, value);
    state.validMoveIds = ids;
    updateTurnBanner(state.currentColor, state.phase, value);

    if (ids.length === 0) {
      announce(`${playerLabel(state.currentColor)} lance ${value}. Aucun mouvement possible.`, true);
      play('pass-turn');
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

  const value = rollDice();
  state.lastDice = value;

  animateDice(value, () => {
    if (value === 6) state.consecutiveSixes++;
    else state.consecutiveSixes = 0;

    if (state.consecutiveSixes >= 3) {
      state.consecutiveSixes = 0;
      play('pass-turn');
      updateTurnBanner(state.currentColor, state.phase, value);
      const penalized = applyTripleSixPenalty(state);
      if (penalized) {
        moveHorse(penalized);
        announce(
          `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne à l'écurie. Tour perdu.`,
          true
        );
      } else {
        announce(`Trois 6 de suite ! Tour perdu.`, true);
      }
      setTimeout(() => endTurn(false), 2000);
      return;
    }

    if (value === 6) play('dice-six');

    const ids = getValidMoves(state, value);
    state.validMoveIds = ids;

    const colorName = COLOR_NAMES[state.currentColor];
    updateTurnBanner(state.currentColor, state.phase, value);

    if (ids.length === 0) {
      announce(`${colorName} lance ${value}. Aucun mouvement possible.`, true);
      play('pass-turn');
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

  for (const ev of events) {
    if (ev.type === 'exit-stable' || ev.type === 'move') {
      const horse = state.horses.find(h => h.color === ev.color && h.id === ev.horseId);
      moveHorse(horse);
      if (ev.bounced) {
        play('move');
        announce(
          `Rebond ! Cheval ${COLOR_NAMES[ev.color]} ${ev.horseId + 1} recule à la case ${horse.relPos - 51} du couloir.`
        );
      } else {
        play(ev.type);
      }
    }
    if (ev.type === 'capture') {
      hadCapture = true;
      const captured = state.horses.find(h => h.color === ev.capturedColor && h.id === ev.capturedId);
      moveHorse(captured);
      play('capture');
      const replayMsg = aiPlayers.has(ev.byColor) ? `${AI_NAME} rejoue !` : "Vous rejouez !";
      announce(
        `Capture ! Cheval ${COLOR_NAMES[ev.capturedColor]} renvoyé à l'écurie. ${replayMsg}`,
        true
      );
    }
    if (ev.type === 'home-stretch') {
      play('home-stretch');
      announce(`${playerLabel(ev.color)} entre dans le couloir d'arrivée !`);
    }
    if (ev.type === 'win') {
      sessionScores[ev.color] = (sessionScores[ev.color] || 0) + 1;
      const nameMap = {};
      state.players.forEach(c => { nameMap[c] = playerLabel(c); });
      setTimeout(() => {
        play('victory');
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
