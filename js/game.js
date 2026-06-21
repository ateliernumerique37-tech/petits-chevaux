'use strict';

export const TRACK = [
  [6,0],[6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
];

// Absolute track index where each color's horse exits the stable
export const START = { red: 0, green: 13, yellow: 26, blue: 39 };

// Home column cells: 6 squares (index 0-5), accessed at relPos 52-57
// relPos 58 = finished (center)
export const HOME = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

export const STABLE_POSITIONS = {
  red:    [[1,1],[1,3],[3,1],[3,3]],
  green:  [[1,10],[1,12],[3,10],[3,12]],
  yellow: [[10,10],[10,12],[12,10],[12,12]],
  blue:   [[10,1],[10,3],[12,1],[12,3]],
};

export const COLOR_NAMES = { red: 'Rouge', green: 'Vert', yellow: 'Jaune', blue: 'Bleu' };
export const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];

// Absolute track positions that are safe from capture
export const SAFE_ABS = new Set([0, 13, 26, 39]);

export const FINISHED_REL = 58;

// winMode : 'all' = amener les 4 chevaux au centre (règle officielle) ; 'one' = 1 cheval suffit (partie rapide)
export function createGame(playerCount, winMode = 'all') {
  const players = COLOR_ORDER.slice(0, playerCount);
  const horses = players.flatMap(color =>
    [0, 1, 2, 3].map(id => ({ color, id, relPos: -1 }))
  );
  return {
    players,
    horses,
    currentColor: players[0],
    phase: 'rolling', // rolling | selecting | pass-phone | game-over
    winMode: winMode === 'one' ? 'one' : 'all',
    winner: null,
    lastDice: null,
    validMoveIds: [],
    consecutiveSixes: 0,
  };
}

export function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

export function getAbsPos(horse) {
  if (horse.relPos < 0 || horse.relPos > 51) return null;
  return (START[horse.color] + horse.relPos) % 52;
}

export function getCellCoords(horse) {
  const r = horse.relPos;
  if (r === -1) return STABLE_POSITIONS[horse.color][horse.id];
  if (r >= 0 && r <= 51) return TRACK[(START[horse.color] + r) % 52];
  if (r >= 52 && r <= 57) return HOME[horse.color][r - 52];
  return [7, 7]; // r === 58 → center
}

export function getHorseDescription(horse) {
  const name = COLOR_NAMES[horse.color];
  const n = horse.id + 1;
  const r = horse.relPos;
  if (r === -1) return `Cheval ${name} ${n}, en écurie`;
  if (r === FINISHED_REL) return `Cheval ${name} ${n}, arrivé au centre`;
  if (r >= 52) return `Cheval ${name} ${n}, couloir d'arrivée, case ${r - 51} sur 6`;
  // Absolute position (1-52) so screen readers can compare positions across colors
  const absPos = getAbsPos(horse);
  const safe = SAFE_ABS.has(absPos) ? ', case protégée' : '';
  return `Cheval ${name} ${n}, case ${absPos + 1} du circuit${safe}`;
}

// Returns a description of what would happen if this horse moves with the given dice value.
// Used to enrich aria-labels during the selection phase.
export function getMoveLabel(state, horse, dice) {
  const base = getHorseDescription(horse);
  const wasInStable = horse.relPos === -1;
  let newRelPos = wasInStable ? 0 : horse.relPos + dice;

  // Bounce-back calculation (home column only)
  let bounced = false;
  if (newRelPos > FINISHED_REL) {
    const excess = newRelPos - FINISHED_REL;
    newRelPos = FINISHED_REL - excess;
    bounced = true;
  }

  if (wasInStable) {
    const exitAbs = START[horse.color];
    return `${base}. Appuyer pour sortir vers la case ${exitAbs + 1} (case de départ, protégée)`;
  }
  if (newRelPos === FINISHED_REL) {
    return `${base}. Appuyer pour rejoindre le centre et gagner !`;
  }
  if (bounced) {
    return `${base}. Appuyer pour rebondir, couloir d'arrivée case ${newRelPos - 51} sur 6`;
  }
  if (newRelPos > 51) {
    return `${base}. Appuyer pour entrer dans le couloir d'arrivée, case ${newRelPos - 51} sur 6`;
  }
  const newAbs = (START[horse.color] + newRelPos) % 52;
  const isSafe = SAFE_ABS.has(newAbs);
  const target = state.horses.find(h =>
    h.color !== horse.color &&
    h.relPos >= 0 && h.relPos <= 51 &&
    (START[h.color] + h.relPos) % 52 === newAbs
  );
  if (target && !isSafe) {
    return `${base}. Appuyer pour avancer à la case ${newAbs + 1} et capturer le cheval ${COLOR_NAMES[target.color]}`;
  }
  if (isSafe) {
    return `${base}. Appuyer pour avancer à la case ${newAbs + 1}, case protégée`;
  }
  return `${base}. Appuyer pour avancer à la case ${newAbs + 1}`;
}

function canMove(horse, dice) {
  if (horse.relPos === FINISHED_REL) return false;
  if (horse.relPos === -1) return dice === 6;
  return true; // Home column overshoots are handled as bounce-back; main track never reaches FINISHED_REL in one move
}

export function getValidMoves(state, dice) {
  const { horses, currentColor } = state;
  return horses
    .filter(h => h.color === currentColor && canMove(h, dice))
    .map(h => h.id);
}

// Returns array of event objects describing what happened
export function applyMove(state, horseId, dice) {
  const { horses, currentColor } = state;
  const horse = horses.find(h => h.color === currentColor && h.id === horseId);
  const events = [];

  const prevRelPos = horse.relPos;
  const wasInStable = prevRelPos === -1;
  let newRelPos = wasInStable ? 0 : prevRelPos + dice;

  // Bounce-back in home column when overshooting center
  let bounced = false;
  if (newRelPos > FINISHED_REL) {
    const excess = newRelPos - FINISHED_REL;
    newRelPos = FINISHED_REL - excess;
    bounced = true;
  }

  horse.relPos = newRelPos;

  events.push({ type: wasInStable ? 'exit-stable' : 'move', bounced, color: currentColor, horseId });

  // Entered the home column from main track (not a bounce — bounces stay in home column)
  if (!wasInStable && !bounced && prevRelPos <= 51 && horse.relPos >= 52) {
    events.push({ type: 'home-stretch', color: currentColor, horseId });
  }

  // Capture: only possible on main track (relPos 0-51), never during bounce (home column is color-exclusive)
  if (!bounced && horse.relPos >= 0 && horse.relPos <= 51) {
    const myAbs = getAbsPos(horse);
    if (!SAFE_ABS.has(myAbs)) {
      for (const other of horses) {
        if (other.color === currentColor) continue;
        const otherAbs = getAbsPos(other);
        if (otherAbs === myAbs) {
          other.relPos = -1;
          events.push({
            type: 'capture',
            capturedColor: other.color,
            capturedId: other.id,
            byColor: currentColor,
          });
        }
      }
    }
  }

  // Win check : selon winMode, 1 cheval suffit ('one') ou les 4 doivent être au centre ('all')
  if (horse.relPos === FINISHED_REL) {
    const won = state.winMode === 'one'
      || horses.every(h => h.color !== currentColor || h.relPos === FINISHED_REL);
    if (won) {
      state.phase = 'game-over';
      state.winner = currentColor;
      events.push({ type: 'win', color: currentColor });
    }
  }

  return events;
}

// Sends the most advanced active horse back to the stable (triple-six penalty)
export function applyTripleSixPenalty(state) {
  const { horses, currentColor } = state;
  const active = horses.filter(h =>
    h.color === currentColor &&
    h.relPos >= 0 &&
    h.relPos < FINISHED_REL
  );
  if (active.length === 0) return null;
  const penalized = active.reduce((best, h) => h.relPos > best.relPos ? h : best);
  penalized.relPos = -1;
  return penalized;
}

export function advanceTurn(state) {
  const { players, currentColor } = state;
  const idx = players.indexOf(currentColor);
  state.currentColor = players[(idx + 1) % players.length];
  state.phase = 'pass-phone';
  state.consecutiveSixes = 0;
}

// Short summary of the current player's horse positions (used at turn start)
export function getTurnSummary(state) {
  const horses = state.horses.filter(h => h.color === state.currentColor);
  const parts = [];

  const stableCount = horses.filter(h => h.relPos === -1).length;
  if (stableCount > 0) parts.push(`${stableCount} en écurie`);

  horses.filter(h => h.relPos >= 0 && h.relPos <= 51).forEach(h => {
    const abs = getAbsPos(h);
    const safe = SAFE_ABS.has(abs) ? ' protégée' : '';
    parts.push(`case ${abs + 1}${safe}`);
  });

  horses.filter(h => h.relPos >= 52 && h.relPos < FINISHED_REL).forEach(h => {
    parts.push(`couloir case ${h.relPos - 51}`);
  });

  const finishedCount = horses.filter(h => h.relPos === FINISHED_REL).length;
  if (finishedCount > 0) parts.push(`${finishedCount} au centre`);

  return parts.join(', ');
}

// Full situation for all players (used by the "Situation" button)
export function getFullSituation(state) {
  return state.players.map(color => {
    const name = COLOR_NAMES[color];
    const horses = state.horses.filter(h => h.color === color);
    const parts = [];

    const stableCount = horses.filter(h => h.relPos === -1).length;
    if (stableCount > 0) parts.push(`${stableCount} en écurie`);

    horses.filter(h => h.relPos >= 0 && h.relPos <= 51).forEach(h => {
      const abs = getAbsPos(h);
      const safe = SAFE_ABS.has(abs) ? ' protégée' : '';
      parts.push(`case ${abs + 1}${safe}`);
    });

    horses.filter(h => h.relPos >= 52 && h.relPos < FINISHED_REL).forEach(h => {
      parts.push(`couloir case ${h.relPos - 51}`);
    });

    const finishedCount = horses.filter(h => h.relPos === FINISHED_REL).length;
    if (finishedCount > 0) parts.push(`${finishedCount} au centre`);

    return `${name} : ${parts.join(', ')}`;
  }).join('. ');
}

// Bernard: win > capture > home-stretch advance > enter home > safe track > avoid danger > exit stable
export function getAIMove(state, dice, difficulty = 'normal') {
  const ids = getValidMoves(state, dice);
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];

  if (difficulty === 'easy') {
    return ids[Math.floor(Math.random() * ids.length)];
  }

  const color = state.currentColor;

  function isExposed(absPos) {
    for (const h of state.horses) {
      if (h.color === color || h.relPos < 0 || h.relPos > 51) continue;
      const hAbs = (START[h.color] + h.relPos) % 52;
      const steps = (absPos - hAbs + 52) % 52;
      if (steps >= 1 && steps <= 6) return true;
    }
    return false;
  }

  function simulate(horse) {
    const wasInStable = horse.relPos === -1;
    let newRel = wasInStable ? 0 : horse.relPos + dice;
    let bounced = false;
    if (newRel > FINISHED_REL) {
      newRel = FINISHED_REL - (newRel - FINISHED_REL);
      bounced = true;
    }
    const newAbs = (!bounced && newRel >= 0 && newRel <= 51)
      ? (START[color] + newRel) % 52
      : null;
    return {
      id: horse.id,
      newRel,
      wasInStable,
      bounced,
      newAbs,
      wins:        newRel === FINISHED_REL,
      captures:    !!newAbs && !SAFE_ABS.has(newAbs) && state.horses.some(h =>
        h.color !== color && h.relPos >= 0 && h.relPos <= 51 &&
        (START[h.color] + h.relPos) % 52 === newAbs),
      entersHome:  !wasInStable && horse.relPos <= 51 && newRel >= 52 && !bounced,
      inHome:      horse.relPos >= 52,
      isSafe:      !!newAbs && SAFE_ABS.has(newAbs),
      isDangerous: !!newAbs && !SAFE_ABS.has(newAbs) && isExposed(newAbs),
    };
  }

  const opts = ids.map(id =>
    simulate(state.horses.find(h => h.color === color && h.id === id))
  );

  if (difficulty === 'hard') {
    let best = opts[0], bestScore = -Infinity;
    for (const o of opts) {
      let s = o.newRel * 2;
      if (o.wins) s += 10000;
      if (o.captures) s += 500;
      if (o.entersHome) s += 200;
      if (o.inHome && !o.bounced) s += 150 + o.newRel;
      if (o.isSafe) s += 80;
      if (o.isDangerous) s -= 60;
      if (o.bounced) s -= 40;
      if (o.wasInStable) s += 20;
      if (!o.isDangerous && !o.isSafe && o.newAbs !== null) s += 30;
      if (s > bestScore) { bestScore = s; best = o; }
    }
    return best.id;
  }

  const pickBest = arr => arr.reduce((b, o) => o.newRel > b.newRel ? o : b);

  // 1. Win immediately
  const win = opts.find(o => o.wins);
  if (win) return win.id;

  // 2. Capture an opponent
  const capture = opts.find(o => o.captures);
  if (capture) return capture.id;

  // 3. Advance a horse already in the home stretch (closest to center)
  const inHome = opts.filter(o => o.inHome && !o.bounced);
  if (inHome.length) return pickBest(inHome).id;

  // 4. Enter the home stretch
  const enterHome = opts.filter(o => o.entersHome);
  if (enterHome.length) return enterHome[0].id;

  // 5. Main track: safe cell first, then avoid danger, then most advanced
  const onTrack = opts.filter(o => !o.wasInStable && o.newAbs !== null);
  if (onTrack.length) {
    const safe = onTrack.filter(o => o.isSafe);
    if (safe.length) return pickBest(safe).id;
    const notDangerous = onTrack.filter(o => !o.isDangerous);
    if (notDangerous.length) return pickBest(notDangerous).id;
    return pickBest(onTrack).id;
  }

  // 6. Exit stable
  return ids[0];
}
