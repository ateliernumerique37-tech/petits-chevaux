'use strict';

import {
  TRACK, HOME, STABLE_POSITIONS, SAFE_ABS,
  COLOR_NAMES, COLOR_ORDER, FINISHED_REL,
  getCellCoords, getHorseDescription,
} from './game.js';

const NS = 'http://www.w3.org/2000/svg';
const CS = 40; // cell size (viewBox units)
const W  = 15 * CS; // 600

const PALETTE = {
  red:    { light: '#ff6f60', main: '#c62828', dark: '#8e0000', tint: '#ffe2de', pen: '#f7b8b0' },
  green:  { light: '#60ad5e', main: '#2e7d32', dark: '#005005', tint: '#dcedc8', pen: '#a5d6a7' },
  yellow: { light: '#ffb04c', main: '#ef6c00', dark: '#b53d00', tint: '#ffe8c2', pen: '#ffcc80' },
  blue:   { light: '#5e92f3', main: '#1565c0', dark: '#003c8f', tint: '#d6e7fb', pen: '#90caf9' },
};

// Distinct shape per color → colourblind-safe identification (kept from v1)
const SHAPES = { red: 'circle', green: 'square', yellow: 'triangle', blue: 'diamond' };

// Chess-knight glyph = "horse", renders as a reliable vector glyph (no emoji font needed)
const HORSE_GLYPH = '♞';

function px(col) { return col * CS + CS / 2; }
function py(row) { return row * CS + CS / 2; }

function el(tag, attrs = {}, text = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== null) e.textContent = text;
  return e;
}

let svg = null;
let horsesLayer = null;

// ─── Static board drawing ─────────────────────────────────────────────────────

export function createBoard(container) {
  svg = el('svg', {
    viewBox: `0 0 ${W} ${W}`,
    id: 'board-svg',
    'aria-label': 'Plateau de Petits Chevaux',
  });

  drawDefs();
  drawBase();
  drawStables();
  drawCross();
  drawTrackCells();
  drawHomeColumns();
  drawCenter();
  drawVignette();

  // Wrap all decorative board elements so screen readers skip them
  const staticLayer = el('g', { 'aria-hidden': 'true' });
  while (svg.firstChild) staticLayer.appendChild(svg.firstChild);
  svg.appendChild(staticLayer);

  horsesLayer = el('g', { id: 'horses-layer' });
  svg.appendChild(horsesLayer);

  container.appendChild(svg);
  return svg;
}

// Gradients & filters
function drawDefs() {
  const defs = el('defs');

  // Board field gradient (warm cream, subtle depth)
  defs.appendChild(linearGrad('grad-field', '#fdf8ec', '#f3ead2', 0, 0, 0, 1));
  // Frame gradient (slate)
  defs.appendChild(linearGrad('grad-frame', '#546e7a', '#263238', 0, 0, 1, 1));

  for (const color of COLOR_ORDER) {
    const p = PALETTE[color];
    // Stable panel: tint → pen
    defs.appendChild(linearGrad(`grad-stable-${color}`, p.tint, p.pen, 0, 0, 1, 1));
    // Home lane: light → main
    defs.appendChild(linearGrad(`grad-home-${color}`, p.light, p.main, 0, 0, 1, 1));
    // Token: glossy radial (light top-left → main → dark edge)
    const rg = el('radialGradient', { id: `grad-token-${color}`, cx: '38%', cy: '32%', r: '75%' });
    rg.appendChild(el('stop', { offset: '0%',  'stop-color': p.light }));
    rg.appendChild(el('stop', { offset: '55%', 'stop-color': p.main }));
    rg.appendChild(el('stop', { offset: '100%', 'stop-color': p.dark }));
    defs.appendChild(rg);
  }

  // Soft drop shadow for pieces (contact shadow → pions posés physiquement)
  const f = el('filter', { id: 'piece-shadow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
  f.appendChild(el('feDropShadow', { dx: 0, dy: 2.4, stdDeviation: 2.2, 'flood-color': '#000000', 'flood-opacity': 0.5 }));
  defs.appendChild(f);

  // Wood grain texture filter for the board field
  const woodFilter = el('filter', { id: 'wood-grain', x: '0', y: '0', width: '100%', height: '100%' });
  const turb = el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.04 0.003', numOctaves: '5', seed: '2', result: 'grain' });
  woodFilter.appendChild(turb);
  const colorMat = el('feColorMatrix', { type: 'matrix', in: 'grain', values: '0 0 0 0 0.62  0 0 0 0 0.48  0 0 0 0 0.28  0 0 0 0.12 0', result: 'wood' });
  woodFilter.appendChild(colorMat);
  const blend = el('feBlend', { in: 'SourceGraphic', in2: 'wood', mode: 'multiply' });
  woodFilter.appendChild(blend);
  defs.appendChild(woodFilter);

  // Vignette douce (lumière du dessus → réalisme)
  const vig = el('radialGradient', { id: 'grad-vignette', cx: '50%', cy: '45%', r: '62%' });
  vig.appendChild(el('stop', { offset: '58%', 'stop-color': '#000000', 'stop-opacity': 0 }));
  vig.appendChild(el('stop', { offset: '100%', 'stop-color': '#2a1e08', 'stop-opacity': 0.15 }));
  defs.appendChild(vig);

  // Gold radial for the centre medallion
  const gold = el('radialGradient', { id: 'grad-gold', cx: '40%', cy: '35%', r: '70%' });
  gold.appendChild(el('stop', { offset: '0%',  'stop-color': '#fff3b0' }));
  gold.appendChild(el('stop', { offset: '60%', 'stop-color': '#ffd54f' }));
  gold.appendChild(el('stop', { offset: '100%', 'stop-color': '#f9a825' }));
  defs.appendChild(gold);

  svg.appendChild(defs);
}

function linearGrad(id, c0, c1, x1, y1, x2, y2) {
  const g = el('linearGradient', { id, x1, y1, x2, y2 });
  g.appendChild(el('stop', { offset: '0%',   'stop-color': c0 }));
  g.appendChild(el('stop', { offset: '100%', 'stop-color': c1 }));
  return g;
}

function drawBase() {
  // Board field with wood grain
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: W, rx: 16, fill: 'url(#grad-field)', filter: 'url(#wood-grain)' }));
  // Frame border
  svg.appendChild(el('rect', { x: 3, y: 3, width: W - 6, height: W - 6, rx: 13, fill: 'none', stroke: 'url(#grad-frame)', 'stroke-width': 6 }));
  // Inner highlight line (biseau)
  svg.appendChild(el('rect', { x: 6.5, y: 6.5, width: W - 13, height: W - 13, rx: 10, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.5, 'stroke-width': 1 }));
}

// Vignette par-dessus le plateau (sous les pions, qui sont dans horsesLayer)
function drawVignette() {
  svg.appendChild(el('rect', {
    x: 0, y: 0, width: W, height: W, rx: 16,
    fill: 'url(#grad-vignette)', 'pointer-events': 'none', 'aria-hidden': 'true',
  }));
}

function drawStables() {
  const defs = [
    { color: 'red',    r: 0, c: 0 },
    { color: 'green',  r: 0, c: 9 },
    { color: 'yellow', r: 9, c: 9 },
    { color: 'blue',   r: 9, c: 0 },
  ];

  for (const { color, r, c } of defs) {
    const pal = PALETTE[color];
    const x = c * CS, y = r * CS, size = 6 * CS;

    // Outer panel
    svg.appendChild(el('rect', {
      x: x + 5, y: y + 5, width: size - 10, height: size - 10,
      rx: 14, fill: `url(#grad-stable-${color})`,
      stroke: pal.main, 'stroke-width': 4,
    }));

    // Inner "pen" where horses wait
    svg.appendChild(el('rect', {
      x: x + 22, y: y + 22, width: size - 44, height: size - 44,
      rx: 10, fill: '#ffffff', opacity: 0.45,
      stroke: pal.dark, 'stroke-width': 1, 'stroke-dasharray': '4 4',
    }));

    // Label with knight glyph + colour name
    svg.appendChild(el('text', {
      x: x + size / 2, y: y + size - 16,
      'text-anchor': 'middle',
      fill: pal.dark, 'font-size': 15, 'font-weight': '800',
      'font-family': 'sans-serif', 'aria-hidden': 'true',
    }, `${HORSE_GLYPH} ${COLOR_NAMES[color].toUpperCase()}`));

    // Slots for the 4 waiting horses
    for (const [sr, sc] of STABLE_POSITIONS[color]) {
      svg.appendChild(el('circle', {
        cx: px(sc), cy: py(sr), r: 16,
        fill: '#ffffff', stroke: pal.main,
        'stroke-width': 2, opacity: 0.85, 'aria-hidden': 'true',
      }));
    }
  }
}

function drawCross() {
  // Bright corridors for the track (horizontal + vertical arms)
  svg.appendChild(el('rect', { x: 0, y: 6 * CS, width: W, height: 3 * CS, fill: '#ffffff' }));
  svg.appendChild(el('rect', { x: 6 * CS, y: 0, width: 3 * CS, height: W, fill: '#ffffff' }));
}

// Cases du circuit commun, numérotées 1-52 (repère partagé avec le lecteur d'écran)
function drawTrackCells() {
  for (let i = 0; i < TRACK.length; i++) {
    const [row, col] = TRACK[i];
    const safe = SAFE_ABS.has(i);

    svg.appendChild(el('rect', {
      x: col * CS + 1.5, y: row * CS + 1.5,
      width: CS - 3, height: CS - 3, rx: 5,
      fill: safe ? '#ffe082' : '#ffffff',
      stroke: safe ? '#f9a825' : '#90a4ae',
      'stroke-width': safe ? 2.5 : 1.5,
    }));

    if (safe) drawStar(px(col), py(row), 9, 4.2, '#f9a825', '#ff6f00');

    // Numéro de case 1-52, dans le coin haut-gauche (visible même avec un pion dessus).
    // Repère partagé avec ce qu'annonce le lecteur d'écran ("case 23 du circuit").
    svg.appendChild(el('text', {
      x: col * CS + 5, y: row * CS + 12,
      'text-anchor': 'start',
      fill: '#37474f', 'font-size': 10, 'font-weight': '700',
      'font-family': 'sans-serif', 'aria-hidden': 'true',
    }, String(i + 1)));
  }
}

function drawStar(x, y, outerR, innerR, fill, stroke) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${x + Math.cos(a) * r},${y + Math.sin(a) * r}`);
  }
  svg.appendChild(el('polygon', {
    points: pts.join(' '), fill, stroke, 'stroke-width': 0.75, 'aria-hidden': 'true',
  }));
}

function drawHomeColumns() {
  for (const color of COLOR_ORDER) {
    const pal = PALETTE[color];
    for (const [row, col] of HOME[color]) {
      svg.appendChild(el('rect', {
        x: col * CS + 1.5, y: row * CS + 1.5,
        width: CS - 3, height: CS - 3, rx: 5,
        fill: `url(#grad-home-${color})`,
        stroke: pal.dark, 'stroke-width': 1.5,
      }));
    }
  }
}

function drawCenter() {
  const cx = 7 * CS + CS / 2, cy = 7 * CS + CS / 2;

  // Rounded platform across the 3×3 centre
  svg.appendChild(el('rect', {
    x: 6 * CS + 3, y: 6 * CS + 3, width: 3 * CS - 6, height: 3 * CS - 6,
    rx: 14, fill: '#fffaf0', stroke: '#cfd8dc', 'stroke-width': 1.5,
  }));

  // Four colour wedges pointing to the centre
  const half = 1.5 * CS;
  const x0 = 6 * CS + 6, y0 = 6 * CS + 6, x1 = 9 * CS - 6, y1 = 9 * CS - 6;
  const wedges = [
    { color: 'red',    pts: `${x0},${y0} ${cx},${cy} ${x0},${y1}` }, // left
    { color: 'green',  pts: `${x0},${y0} ${cx},${cy} ${x1},${y0}` }, // top
    { color: 'yellow', pts: `${x1},${y0} ${cx},${cy} ${x1},${y1}` }, // right
    { color: 'blue',   pts: `${x0},${y1} ${cx},${cy} ${x1},${y1}` }, // bottom
  ];
  for (const { color, pts } of wedges) {
    svg.appendChild(el('polygon', { points: pts, fill: PALETTE[color].main, opacity: 0.9, 'aria-hidden': 'true' }));
  }

  // Gold medallion + star at the goal
  svg.appendChild(el('circle', { cx, cy, r: 20, fill: 'url(#grad-gold)', stroke: '#f57f17', 'stroke-width': 2, 'aria-hidden': 'true' }));
  drawStar(cx, cy, 13, 5.5, '#ffffff', '#f9a825');
}

// ─── Horse pieces ──────────────────────────────────────────────────────────────

function makeHorsePiece(horse) {
  const g = el('g', {
    id: `horse-${horse.color}-${horse.id}`,
    class: `horse horse-${horse.color}`,
    'data-color': horse.color,
    'data-id': horse.id,
    tabindex: '-1',
    role: 'button',
    'aria-label': getHorseDescription(horse),
    'aria-disabled': 'true',
  });

  // Invisible 44px hit target for touch accessibility (WCAG 2.5.5)
  g.appendChild(el('circle', { cx: 0, cy: 0, r: 22, fill: 'none', 'pointer-events': 'all' }));

  // Visual token (shadowed) — decorative, the <g>'s aria-label carries the meaning
  const vis = el('g', { filter: 'url(#piece-shadow)', 'aria-hidden': 'true' });
  addToken(vis, horse.color, horse.id);
  g.appendChild(vis);

  return g;
}

function addToken(vis, color, id) {
  const fill = `url(#grad-token-${color})`;
  const shape = SHAPES[color];
  let numY = 0;

  if (shape === 'circle') {
    vis.appendChild(el('circle', { cx: 0, cy: 0, r: 15.5, fill, stroke: '#ffffff', 'stroke-width': 2.5 }));
  } else if (shape === 'square') {
    vis.appendChild(el('rect', { x: -14.5, y: -14.5, width: 29, height: 29, rx: 6, fill, stroke: '#ffffff', 'stroke-width': 2.5 }));
  } else if (shape === 'triangle') {
    vis.appendChild(el('polygon', { points: '0,-16.5 15.5,10 -15.5,10', fill, stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    numY = 3.5;
  } else { // diamond
    vis.appendChild(el('polygon', { points: '0,-17 17,0 0,17 -17,0', fill, stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  }

  // Glossy highlight
  vis.appendChild(el('ellipse', { cx: -4.5, cy: -5.5, rx: 5.5, ry: 3.8, fill: '#ffffff', opacity: 0.45 }));

  // Bold number (1–4) — matches the Alt+Maj+1..4 shortcuts
  vis.appendChild(el('text', {
    x: 0, y: numY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-family': 'sans-serif', 'font-size': 17, 'font-weight': '800',
    fill: '#ffffff', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 0.6,
    'paint-order': 'stroke', 'aria-hidden': 'true',
  }, String(id + 1)));
}

function positionPiece(piece, horse, instant = false) {
  const [row, col] = getCellCoords(horse);
  if (instant) piece.style.transition = 'none';
  // CSS transform animates smoothly (SVG transform attribute does not)
  piece.style.transform = `translate(${px(col)}px,${py(row)}px)`;
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => { piece.style.transition = ''; }));
  piece.setAttribute('aria-label', getHorseDescription(horse));
  piece.classList.toggle('horse-finished', horse.relPos === FINISHED_REL);
  piece.classList.toggle('horse-stable', horse.relPos === -1);
}

export function initHorses(horses) {
  horsesLayer.innerHTML = '';
  for (const horse of horses) {
    const piece = makeHorsePiece(horse);
    horsesLayer.appendChild(piece);
    positionPiece(piece, horse, true); // instant = skip transition on init
  }
}

export function moveHorse(horse) {
  const piece = getHorsePiece(horse.color, horse.id);
  if (piece) positionPiece(piece, horse, false);
}

function getHorsePiece(color, id) {
  return horsesLayer?.querySelector(`#horse-${color}-${id}`);
}

export function setMovable(color, horseIds, onSelect) {
  clearHighlights();
  for (const id of horseIds) {
    const piece = getHorsePiece(color, id);
    if (!piece) continue;
    piece.classList.add('can-move');
    piece.setAttribute('tabindex', '0');
    piece.setAttribute('aria-disabled', 'false');

    const pick = () => {
      clearHighlights();
      piece.classList.add('selected');
      onSelect(id);
    };
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    };
    piece._pickHandler = pick;
    piece._keyHandler = onKey;
    piece.addEventListener('click', pick);
    piece.addEventListener('keydown', onKey);
  }

  // Delay focus so the ARIA live region announcement plays first
  setTimeout(() => {
    const first = getHorsePiece(color, horseIds[0]);
    if (first) first.focus();
  }, 200);
}

export function updateHorseLabel(color, id, label) {
  const piece = getHorsePiece(color, id);
  if (piece) piece.setAttribute('aria-label', label);
}

export function clearHighlights() {
  if (!horsesLayer) return;
  horsesLayer.querySelectorAll('.horse').forEach(piece => {
    piece.classList.remove('can-move', 'selected');
    piece.setAttribute('tabindex', '-1');
    piece.setAttribute('aria-disabled', 'true');
    if (piece._pickHandler) {
      piece.removeEventListener('click', piece._pickHandler);
      delete piece._pickHandler;
    }
    if (piece._keyHandler) {
      piece.removeEventListener('keydown', piece._keyHandler);
      delete piece._keyHandler;
    }
  });
}

// Repère du dernier pion déplacé (persiste jusqu'au coup suivant)
export function markLastMoved(color, id) {
  clearLastMoved();
  const piece = getHorsePiece(color, id);
  if (piece) piece.classList.add('last-moved');
}

export function clearLastMoved() {
  if (!horsesLayer) return;
  horsesLayer.querySelectorAll('.horse.last-moved').forEach(p => p.classList.remove('last-moved'));
}
