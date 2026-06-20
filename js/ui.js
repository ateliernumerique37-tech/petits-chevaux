'use strict';

import { COLOR_NAMES } from './game.js';

const $ = id => document.getElementById(id);

// ─── Screen management ────────────────────────────────────────────────────────

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.hidden = true;
    s.setAttribute('aria-hidden', 'true');
  });
  const screen = $(`screen-${name}`);
  screen.hidden = false;
  screen.setAttribute('aria-hidden', 'false');

  // Move focus to first focusable element in the new screen
  requestAnimationFrame(() => {
    const focusable = screen.querySelector('button, [tabindex="0"], input, select');
    if (focusable) focusable.focus();
  });
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

export function initSetupScreen(onStart) {
  const startBtn = $('btn-start');
  startBtn.addEventListener('click', () => {
    const count = parseInt($('player-count').value, 10);
    const aiMode = $('ai-mode').value === 'ai';
    onStart(count, aiMode);
  });
}

// ─── Pass-phone screen ────────────────────────────────────────────────────────

let passResolve = null;

export function showPassPhone(color, onShown) {
  return new Promise(resolve => {
    passResolve = resolve;

    const pal = {
      red:    '#c62828', green:  '#2e7d32',
      yellow: '#f57f17', blue:   '#1565c0',
    };
    const screen = $('screen-pass');
    screen.style.setProperty('--pass-color', pal[color]);
    $('pass-player-name').textContent = COLOR_NAMES[color];
    $('pass-player-name').style.color = pal[color];

    showScreen('pass');
    if (onShown) onShown();
    announce(`Passez le téléphone au joueur ${COLOR_NAMES[color]}`, true);
  });
}

export function initPassScreen() {
  $('btn-ready').addEventListener('click', () => {
    if (passResolve) { passResolve(); passResolve = null; }
  });
}

// ─── Game screen ──────────────────────────────────────────────────────────────

export function updateTurnBanner(color, phase, diceValue) {
  const pal = {
    red:    '#c62828', green:  '#2e7d32',
    yellow: '#f57f17', blue:   '#1565c0',
  };
  const banner = $('turn-banner');
  banner.textContent = `Tour de ${COLOR_NAMES[color]}`;
  banner.style.color = pal[color];

  const diceArea = $('dice-result');
  if (diceValue !== null) {
    diceArea.textContent = diceValue;
    diceArea.setAttribute('aria-label', `Résultat du dé : ${diceValue}`);
  } else {
    diceArea.textContent = '';
    diceArea.removeAttribute('aria-label');
  }
}

export function setDiceEnabled(enabled) {
  const btn = $('btn-dice');
  btn.disabled = !enabled;
  btn.setAttribute('aria-disabled', String(!enabled));
}

export function initDiceButton(onClick) {
  $('btn-dice').addEventListener('click', onClick);
}

export function animateDice(finalValue, callback) {
  const btn = $('btn-dice');
  const face = $('dice-face');
  btn.classList.add('rolling');

  let ticks = 0;
  const interval = setInterval(() => {
    face.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    if (++ticks >= 8) {
      clearInterval(interval);
      face.textContent = DICE_FACES[finalValue - 1];
      btn.classList.remove('rolling');
      callback();
    }
  }, 80);
}

export function showWinner(color, scores, nameMap) {
  const displayName = (nameMap && nameMap[color]) || COLOR_NAMES[color];
  $('winner-name').textContent = displayName;
  $('winner-name').style.color = {
    red: '#c62828', green: '#2e7d32', yellow: '#f57f17', blue: '#1565c0',
  }[color];

  const scoresEl = $('winner-scores');
  if (scores) {
    const parts = Object.entries(scores)
      .filter(([, s]) => s > 0)
      .map(([c, s]) => {
        const n = (nameMap && nameMap[c]) || COLOR_NAMES[c];
        return `${n}: ${s} victoire${s > 1 ? 's' : ''}`;
      });
    scoresEl.textContent = parts.length > 0 ? `Scores: ${parts.join(', ')}` : '';
  } else {
    scoresEl.textContent = '';
  }

  showScreen('winner');
  announce(`Victoire ! ${displayName} a gagné la partie !`, true);
}

export function initWinnerScreen(onRestart) {
  $('btn-restart').addEventListener('click', onRestart);
}

// ─── ARIA live announcer ──────────────────────────────────────────────────────

let lastAnnouncement = '';
let politeToggle = false;

export function announce(message, urgent = false) {
  lastAnnouncement = message;
  if (urgent) {
    const region = $('aria-alert');
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = message; });
  } else {
    // Alternate between two polite regions so repeated/identical text is always re-read
    politeToggle = !politeToggle;
    const activeId  = politeToggle ? 'aria-status-a' : 'aria-status-b';
    const inactiveId = politeToggle ? 'aria-status-b' : 'aria-status-a';
    $(inactiveId).textContent = '';
    const active = $(activeId);
    active.textContent = '';
    requestAnimationFrame(() => { active.textContent = message; });
  }
}

export function repeatLastAnnouncement() {
  if (lastAnnouncement) announce(lastAnnouncement);
}

export function initRepeatButton(onClick) {
  $('btn-repeat').addEventListener('click', onClick);
}

export function initSituationButton(onClick) {
  $('btn-situation').addEventListener('click', onClick);
}

export function initQuitButton(onClick) {
  $('btn-quit').addEventListener('click', onClick);
}

// ─── Dice face glyphs ─────────────────────────────────────────────────────────

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
