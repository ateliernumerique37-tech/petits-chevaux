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
    const winMode = $('win-mode').value;
    const difficulty = $('ai-difficulty')?.value || 'normal';
    onStart(count, aiMode, winMode, difficulty);
  });

  // Return focus to each select after selection (mobile browsers / screen readers
  // sometimes move focus away after the native picker closes or after a DOM change)
  ['player-count', 'win-mode', 'ai-difficulty'].forEach(id => {
    const sel = $(id);
    if (sel) sel.addEventListener('change', () => sel.focus());
  });

  // Show/hide AI difficulty selector + return focus to ai-mode
  const aiSelect = $('ai-mode');
  const diffGroup = $('difficulty-group');
  if (aiSelect && diffGroup) {
    const toggle = (fromUser = false) => {
      diffGroup.hidden = aiSelect.value !== 'ai';
      if (fromUser) aiSelect.focus();
    };
    aiSelect.addEventListener('change', () => toggle(true));
    toggle();
  }
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

// ─── Journal visuel des coups ─────────────────────────────────────────────────

const LOG_PAL = {
  red: '#c62828', green: '#2e7d32', yellow: '#ef6c00', blue: '#1565c0',
};

export function clearEventLog() {
  const list = $('event-log-list');
  if (!list) return;
  list.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'event-log-empty';
  li.textContent = 'La partie commence…';
  list.appendChild(li);
}

// text: action concise ; color: couleur du joueur (pour la pastille) ; capture: met en rouge
export function logEvent(text, color, capture = false) {
  const list = $('event-log-list');
  if (!list) return;
  const placeholder = list.querySelector('.event-log-empty');
  if (placeholder) placeholder.remove();

  const li = document.createElement('li');
  if (color) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = LOG_PAL[color] || '#888';
    li.appendChild(dot);
  }
  const span = document.createElement('span');
  if (capture) span.className = 'capture';
  span.textContent = text;
  li.appendChild(span);

  list.insertBefore(li, list.firstChild);
  while (list.children.length > 40) list.removeChild(list.lastChild);
}

// ─── Resume button ───────────────────────────────────────────────────────────

export function initResumeButton(onResume) {
  const btn = $('btn-resume');
  if (btn) btn.addEventListener('click', onResume);
}

export function showResumeButton(visible) {
  const btn = $('btn-resume');
  if (btn) btn.hidden = !visible;
}

// ─── Stats screen ────────────────────────────────────────────────────────────

const STATS_KEY = 'petits-chevaux-stats';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

export function renderStats() {
  const container = $('stats-content');
  const clearBtn = $('btn-stats-clear');
  if (!container) return;

  let stats = [];
  try { stats = JSON.parse(localStorage.getItem(STATS_KEY) || '[]'); } catch {}

  if (stats.length === 0) {
    container.innerHTML = '<p class="stats-summary" style="text-align:center">Aucune partie terminée pour l\'instant.</p>';
    if (clearBtn) clearBtn.hidden = true;
    return;
  }

  const total = stats.length;
  const aiGames = stats.filter(s => s.aiMode);
  const aiWins = aiGames.filter(s => s.winner === 'red');
  const avgDuration = Math.round(stats.reduce((a, s) => a + (s.duration || 0), 0) / total);

  let html = '<div class="stats-summary">';
  html += `<p><strong>${total}</strong> partie${total > 1 ? 's' : ''} terminée${total > 1 ? 's' : ''}</p>`;
  if (aiGames.length > 0) {
    const pct = Math.round(aiWins.length / aiGames.length * 100);
    html += `<p>Contre l'IA : <strong>${aiWins.length}/${aiGames.length}</strong> victoire${aiWins.length > 1 ? 's' : ''} (${pct} %)</p>`;
  }
  html += `<p>Durée moyenne : <strong>${formatDuration(avgDuration)}</strong></p>`;
  html += '</div>';

  html += '<p class="stats-subtitle">Dernières parties</p>';
  html += '<ul class="stats-list">';
  const recent = stats.slice(-10).reverse();
  for (const s of recent) {
    const date = new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const diff = { easy: 'facile', normal: 'normal', hard: 'difficile' };
    const mode = s.aiMode ? `IA ${diff[s.aiDifficulty] || 'normal'}` : `${s.playerCount} humains`;
    const dur = s.duration ? ` — ${formatDuration(s.duration)}` : '';
    html += `<li>${date} — ${s.winnerLabel || s.winner} gagne (${mode})${dur}</li>`;
  }
  html += '</ul>';

  container.innerHTML = html;
  if (clearBtn) clearBtn.hidden = false;
}

export function initStatsScreen(onBack) {
  const backBtn = $('btn-stats-back');
  if (backBtn) backBtn.addEventListener('click', onBack);

  const statsBtn = $('btn-stats');
  if (statsBtn) {
    statsBtn.addEventListener('click', () => {
      renderStats();
      showScreen('stats');
    });
  }

  const clearBtn = $('btn-stats-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      try { localStorage.removeItem(STATS_KEY); } catch {}
      renderStats();
    });
  }
}

// ─── Theme toggle ────────────────────────────────────────────────────────────

const THEME_KEY = 'petits-chevaux-theme';
const THEME_LABELS = { auto: 'Thème : Auto', light: 'Thème : Clair', dark: 'Thème : Sombre' };
const THEME_CYCLE = ['auto', 'light', 'dark'];

function applyThemeClass(theme) {
  document.documentElement.classList.remove('theme-light', 'theme-dark');
  if (theme === 'light') document.documentElement.classList.add('theme-light');
  else if (theme === 'dark') document.documentElement.classList.add('theme-dark');
}

export function initThemeToggle() {
  let current = 'auto';
  try { current = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
  applyThemeClass(current);

  const btn = $('btn-theme');
  if (!btn) return;
  btn.textContent = THEME_LABELS[current] || THEME_LABELS.auto;

  btn.addEventListener('click', () => {
    const idx = THEME_CYCLE.indexOf(current);
    current = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    applyThemeClass(current);
    btn.textContent = THEME_LABELS[current];
    try { localStorage.setItem(THEME_KEY, current); } catch {}
  });
}

// ─── Shake-to-roll toggle (préférence persistante et révocable) ───────────────

const SHAKE_KEY = 'petits-chevaux-shake';
let shakeEnabled = true;

export function isShakeEnabled() { return shakeEnabled; }

// onEnable() est appelé quand l'utilisateur ACTIVE l'option (geste utilisateur),
// pour demander la permission de mouvement iOS dans le bon contexte.
export function initShakeToggle(onEnable) {
  try { shakeEnabled = localStorage.getItem(SHAKE_KEY) !== 'off'; } catch {}

  const btn = $('btn-shake');
  if (!btn) return;

  const render = () => {
    btn.textContent = shakeEnabled
      ? 'Secouer pour lancer : Activé'
      : 'Secouer pour lancer : Désactivé';
  };
  render();

  btn.addEventListener('click', () => {
    shakeEnabled = !shakeEnabled;
    try { localStorage.setItem(SHAKE_KEY, shakeEnabled ? 'on' : 'off'); } catch {}
    render();
    if (shakeEnabled && onEnable) onEnable();
  });
}

// ─── Dice face glyphs ─────────────────────────────────────────────────────────

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
