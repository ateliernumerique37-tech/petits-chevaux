"use strict";
(() => {
  // js/game.js
  var TRACK = [
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 3],
    [6, 4],
    [6, 5],
    [5, 6],
    [4, 6],
    [3, 6],
    [2, 6],
    [1, 6],
    [0, 6],
    [0, 7],
    [0, 8],
    [1, 8],
    [2, 8],
    [3, 8],
    [4, 8],
    [5, 8],
    [6, 9],
    [6, 10],
    [6, 11],
    [6, 12],
    [6, 13],
    [6, 14],
    [7, 14],
    [8, 14],
    [8, 13],
    [8, 12],
    [8, 11],
    [8, 10],
    [8, 9],
    [9, 8],
    [10, 8],
    [11, 8],
    [12, 8],
    [13, 8],
    [14, 8],
    [14, 7],
    [14, 6],
    [13, 6],
    [12, 6],
    [11, 6],
    [10, 6],
    [9, 6],
    [8, 5],
    [8, 4],
    [8, 3],
    [8, 2],
    [8, 1],
    [8, 0],
    [7, 0]
  ];
  var START = { red: 0, green: 13, yellow: 26, blue: 39 };
  var HOME = {
    red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
    blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
  };
  var STABLE_POSITIONS = {
    red: [[1, 1], [1, 3], [3, 1], [3, 3]],
    green: [[1, 10], [1, 12], [3, 10], [3, 12]],
    yellow: [[10, 10], [10, 12], [12, 10], [12, 12]],
    blue: [[10, 1], [10, 3], [12, 1], [12, 3]]
  };
  var COLOR_NAMES = { red: "Rouge", green: "Vert", yellow: "Jaune", blue: "Bleu" };
  var COLOR_ORDER = ["red", "green", "yellow", "blue"];
  var SAFE_ABS = /* @__PURE__ */ new Set([0, 13, 26, 39]);
  var FINISHED_REL = 58;
  function createGame(playerCount, winMode = "all") {
    const players = COLOR_ORDER.slice(0, playerCount);
    const horses = players.flatMap(
      (color) => [0, 1, 2, 3].map((id) => ({ color, id, relPos: -1 }))
    );
    return {
      players,
      horses,
      currentColor: players[0],
      phase: "rolling",
      // rolling | selecting | pass-phone | game-over
      winMode: winMode === "one" ? "one" : "all",
      winner: null,
      lastDice: null,
      validMoveIds: [],
      consecutiveSixes: 0
    };
  }
  function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }
  function getAbsPos(horse) {
    if (horse.relPos < 0 || horse.relPos > 51) return null;
    return (START[horse.color] + horse.relPos) % 52;
  }
  function getCellCoords(horse) {
    const r = horse.relPos;
    if (r === -1) return STABLE_POSITIONS[horse.color][horse.id];
    if (r >= 0 && r <= 51) return TRACK[(START[horse.color] + r) % 52];
    if (r >= 52 && r <= 57) return HOME[horse.color][r - 52];
    return [7, 7];
  }
  function getHorseDescription(horse) {
    const name = COLOR_NAMES[horse.color];
    const n = horse.id + 1;
    const r = horse.relPos;
    if (r === -1) return `Cheval ${name} ${n}, en \xE9curie`;
    if (r === FINISHED_REL) return `Cheval ${name} ${n}, arriv\xE9 au centre`;
    if (r >= 52) return `Cheval ${name} ${n}, couloir d'arriv\xE9e, case ${r - 51} sur 6`;
    const absPos = getAbsPos(horse);
    const safe = SAFE_ABS.has(absPos) ? ", case prot\xE9g\xE9e" : "";
    return `Cheval ${name} ${n}, case ${absPos + 1} du circuit${safe}`;
  }
  function getMoveLabel(state2, horse, dice) {
    const base = getHorseDescription(horse);
    const wasInStable = horse.relPos === -1;
    let newRelPos = wasInStable ? 0 : horse.relPos + dice;
    let bounced = false;
    if (newRelPos > FINISHED_REL) {
      const excess = newRelPos - FINISHED_REL;
      newRelPos = FINISHED_REL - excess;
      bounced = true;
    }
    if (wasInStable) {
      const exitAbs = START[horse.color];
      return `${base}. Appuyer pour sortir vers la case ${exitAbs + 1} (case de d\xE9part, prot\xE9g\xE9e)`;
    }
    if (newRelPos === FINISHED_REL) {
      return `${base}. Appuyer pour rejoindre le centre et gagner !`;
    }
    if (bounced) {
      return `${base}. Appuyer pour rebondir, couloir d'arriv\xE9e case ${newRelPos - 51} sur 6`;
    }
    if (newRelPos > 51) {
      return `${base}. Appuyer pour entrer dans le couloir d'arriv\xE9e, case ${newRelPos - 51} sur 6`;
    }
    const newAbs = (START[horse.color] + newRelPos) % 52;
    const isSafe = SAFE_ABS.has(newAbs);
    const target = state2.horses.find(
      (h) => h.color !== horse.color && h.relPos >= 0 && h.relPos <= 51 && (START[h.color] + h.relPos) % 52 === newAbs
    );
    if (target && !isSafe) {
      return `${base}. Appuyer pour avancer \xE0 la case ${newAbs + 1} et capturer le cheval ${COLOR_NAMES[target.color]}`;
    }
    if (isSafe) {
      return `${base}. Appuyer pour avancer \xE0 la case ${newAbs + 1}, case prot\xE9g\xE9e`;
    }
    return `${base}. Appuyer pour avancer \xE0 la case ${newAbs + 1}`;
  }
  function canMove(horse, dice) {
    if (horse.relPos === FINISHED_REL) return false;
    if (horse.relPos === -1) return dice === 6;
    return true;
  }
  function getValidMoves(state2, dice) {
    const { horses, currentColor } = state2;
    return horses.filter((h) => h.color === currentColor && canMove(h, dice)).map((h) => h.id);
  }
  function applyMove(state2, horseId, dice) {
    const { horses, currentColor } = state2;
    const horse = horses.find((h) => h.color === currentColor && h.id === horseId);
    const events = [];
    const prevRelPos = horse.relPos;
    const wasInStable = prevRelPos === -1;
    let newRelPos = wasInStable ? 0 : prevRelPos + dice;
    let bounced = false;
    if (newRelPos > FINISHED_REL) {
      const excess = newRelPos - FINISHED_REL;
      newRelPos = FINISHED_REL - excess;
      bounced = true;
    }
    horse.relPos = newRelPos;
    events.push({ type: wasInStable ? "exit-stable" : "move", bounced, color: currentColor, horseId });
    if (!wasInStable && !bounced && prevRelPos <= 51 && horse.relPos >= 52) {
      events.push({ type: "home-stretch", color: currentColor, horseId });
    }
    if (!bounced && horse.relPos >= 0 && horse.relPos <= 51) {
      const myAbs = getAbsPos(horse);
      if (!SAFE_ABS.has(myAbs)) {
        for (const other of horses) {
          if (other.color === currentColor) continue;
          const otherAbs = getAbsPos(other);
          if (otherAbs === myAbs) {
            other.relPos = -1;
            events.push({
              type: "capture",
              capturedColor: other.color,
              capturedId: other.id,
              byColor: currentColor
            });
          }
        }
      }
    }
    if (horse.relPos === FINISHED_REL) {
      const won = state2.winMode === "one" || horses.every((h) => h.color !== currentColor || h.relPos === FINISHED_REL);
      if (won) {
        state2.phase = "game-over";
        state2.winner = currentColor;
        events.push({ type: "win", color: currentColor });
      }
    }
    return events;
  }
  function applyTripleSixPenalty(state2) {
    const { horses, currentColor } = state2;
    const active = horses.filter(
      (h) => h.color === currentColor && h.relPos >= 0 && h.relPos < FINISHED_REL
    );
    if (active.length === 0) return null;
    const penalized = active.reduce((best, h) => h.relPos > best.relPos ? h : best);
    penalized.relPos = -1;
    return penalized;
  }
  function advanceTurn(state2) {
    const { players, currentColor } = state2;
    const idx = players.indexOf(currentColor);
    state2.currentColor = players[(idx + 1) % players.length];
    state2.phase = "pass-phone";
    state2.consecutiveSixes = 0;
  }
  function getTurnSummary(state2) {
    const horses = state2.horses.filter((h) => h.color === state2.currentColor);
    const parts = [];
    const stableCount = horses.filter((h) => h.relPos === -1).length;
    if (stableCount > 0) parts.push(`${stableCount} en \xE9curie`);
    horses.filter((h) => h.relPos >= 0 && h.relPos <= 51).forEach((h) => {
      const abs = getAbsPos(h);
      const safe = SAFE_ABS.has(abs) ? " prot\xE9g\xE9e" : "";
      parts.push(`case ${abs + 1}${safe}`);
    });
    horses.filter((h) => h.relPos >= 52 && h.relPos < FINISHED_REL).forEach((h) => {
      parts.push(`couloir case ${h.relPos - 51}`);
    });
    const finishedCount = horses.filter((h) => h.relPos === FINISHED_REL).length;
    if (finishedCount > 0) parts.push(`${finishedCount} au centre`);
    return parts.join(", ");
  }
  function getFullSituation(state2) {
    return state2.players.map((color) => {
      const name = COLOR_NAMES[color];
      const horses = state2.horses.filter((h) => h.color === color);
      const parts = [];
      const stableCount = horses.filter((h) => h.relPos === -1).length;
      if (stableCount > 0) parts.push(`${stableCount} en \xE9curie`);
      horses.filter((h) => h.relPos >= 0 && h.relPos <= 51).forEach((h) => {
        const abs = getAbsPos(h);
        const safe = SAFE_ABS.has(abs) ? " prot\xE9g\xE9e" : "";
        parts.push(`case ${abs + 1}${safe}`);
      });
      horses.filter((h) => h.relPos >= 52 && h.relPos < FINISHED_REL).forEach((h) => {
        parts.push(`couloir case ${h.relPos - 51}`);
      });
      const finishedCount = horses.filter((h) => h.relPos === FINISHED_REL).length;
      if (finishedCount > 0) parts.push(`${finishedCount} au centre`);
      return `${name} : ${parts.join(", ")}`;
    }).join(". ");
  }
  function getAIMove(state2, dice, difficulty = "normal") {
    const ids = getValidMoves(state2, dice);
    if (ids.length === 0) return null;
    if (ids.length === 1) return ids[0];
    if (difficulty === "easy") {
      return ids[Math.floor(Math.random() * ids.length)];
    }
    const color = state2.currentColor;
    function isExposed(absPos) {
      for (const h of state2.horses) {
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
      const newAbs = !bounced && newRel >= 0 && newRel <= 51 ? (START[color] + newRel) % 52 : null;
      return {
        id: horse.id,
        newRel,
        wasInStable,
        bounced,
        newAbs,
        wins: newRel === FINISHED_REL,
        captures: !!newAbs && !SAFE_ABS.has(newAbs) && state2.horses.some((h) => h.color !== color && h.relPos >= 0 && h.relPos <= 51 && (START[h.color] + h.relPos) % 52 === newAbs),
        entersHome: !wasInStable && horse.relPos <= 51 && newRel >= 52 && !bounced,
        inHome: horse.relPos >= 52,
        isSafe: !!newAbs && SAFE_ABS.has(newAbs),
        isDangerous: !!newAbs && !SAFE_ABS.has(newAbs) && isExposed(newAbs)
      };
    }
    const opts = ids.map(
      (id) => simulate(state2.horses.find((h) => h.color === color && h.id === id))
    );
    if (difficulty === "hard") {
      let best = opts[0], bestScore = -Infinity;
      for (const o of opts) {
        let s = o.newRel * 2;
        if (o.wins) s += 1e4;
        if (o.captures) s += 500;
        if (o.entersHome) s += 200;
        if (o.inHome && !o.bounced) s += 150 + o.newRel;
        if (o.isSafe) s += 80;
        if (o.isDangerous) s -= 60;
        if (o.bounced) s -= 40;
        if (o.wasInStable) s += 20;
        if (!o.isDangerous && !o.isSafe && o.newAbs !== null) s += 30;
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      return best.id;
    }
    const pickBest = (arr) => arr.reduce((b, o) => o.newRel > b.newRel ? o : b);
    const win = opts.find((o) => o.wins);
    if (win) return win.id;
    const capture = opts.find((o) => o.captures);
    if (capture) return capture.id;
    const inHome = opts.filter((o) => o.inHome && !o.bounced);
    if (inHome.length) return pickBest(inHome).id;
    const enterHome = opts.filter((o) => o.entersHome);
    if (enterHome.length) return enterHome[0].id;
    const onTrack = opts.filter((o) => !o.wasInStable && o.newAbs !== null);
    if (onTrack.length) {
      const safe = onTrack.filter((o) => o.isSafe);
      if (safe.length) return pickBest(safe).id;
      const notDangerous = onTrack.filter((o) => !o.isDangerous);
      if (notDangerous.length) return pickBest(notDangerous).id;
      return pickBest(onTrack).id;
    }
    return ids[0];
  }

  // js/board.js
  var NS = "http://www.w3.org/2000/svg";
  var CS = 40;
  var W = 15 * CS;
  var PALETTE = {
    red: { light: "#ff6f60", main: "#c62828", dark: "#8e0000", tint: "#ffe2de", pen: "#f7b8b0" },
    green: { light: "#60ad5e", main: "#2e7d32", dark: "#005005", tint: "#dcedc8", pen: "#a5d6a7" },
    yellow: { light: "#ffb04c", main: "#ef6c00", dark: "#b53d00", tint: "#ffe8c2", pen: "#ffcc80" },
    blue: { light: "#5e92f3", main: "#1565c0", dark: "#003c8f", tint: "#d6e7fb", pen: "#90caf9" }
  };
  var SHAPES = { red: "circle", green: "square", yellow: "triangle", blue: "diamond" };
  var HORSE_GLYPH = "\u265E";
  function px(col) {
    return col * CS + CS / 2;
  }
  function py(row) {
    return row * CS + CS / 2;
  }
  function el(tag, attrs = {}, text = null) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== null) e.textContent = text;
    return e;
  }
  var svg = null;
  var horsesLayer = null;
  function createBoard(container) {
    svg = el("svg", {
      viewBox: `0 0 ${W} ${W}`,
      id: "board-svg",
      "aria-label": "Plateau de Petits Chevaux"
    });
    drawDefs();
    drawBase();
    drawStables();
    drawCross();
    drawTrackCells();
    drawHomeColumns();
    drawCenter();
    drawVignette();
    const staticLayer = el("g", { "aria-hidden": "true" });
    while (svg.firstChild) staticLayer.appendChild(svg.firstChild);
    svg.appendChild(staticLayer);
    horsesLayer = el("g", { id: "horses-layer" });
    svg.appendChild(horsesLayer);
    container.appendChild(svg);
    return svg;
  }
  function drawDefs() {
    const defs = el("defs");
    defs.appendChild(linearGrad("grad-field", "#fdf8ec", "#f3ead2", 0, 0, 0, 1));
    defs.appendChild(linearGrad("grad-frame", "#546e7a", "#263238", 0, 0, 1, 1));
    for (const color of COLOR_ORDER) {
      const p = PALETTE[color];
      defs.appendChild(linearGrad(`grad-stable-${color}`, p.tint, p.pen, 0, 0, 1, 1));
      defs.appendChild(linearGrad(`grad-home-${color}`, p.light, p.main, 0, 0, 1, 1));
      const rg = el("radialGradient", { id: `grad-token-${color}`, cx: "38%", cy: "32%", r: "75%" });
      rg.appendChild(el("stop", { offset: "0%", "stop-color": p.light }));
      rg.appendChild(el("stop", { offset: "55%", "stop-color": p.main }));
      rg.appendChild(el("stop", { offset: "100%", "stop-color": p.dark }));
      defs.appendChild(rg);
    }
    const f = el("filter", { id: "piece-shadow", x: "-50%", y: "-50%", width: "200%", height: "200%" });
    f.appendChild(el("feDropShadow", { dx: 0, dy: 2.4, stdDeviation: 2.2, "flood-color": "#000000", "flood-opacity": 0.5 }));
    defs.appendChild(f);
    const woodFilter = el("filter", { id: "wood-grain", x: "0", y: "0", width: "100%", height: "100%" });
    const turb = el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.04 0.003", numOctaves: "5", seed: "2", result: "grain" });
    woodFilter.appendChild(turb);
    const colorMat = el("feColorMatrix", { type: "matrix", in: "grain", values: "0 0 0 0 0.62  0 0 0 0 0.48  0 0 0 0 0.28  0 0 0 0.12 0", result: "wood" });
    woodFilter.appendChild(colorMat);
    const blend = el("feBlend", { in: "SourceGraphic", in2: "wood", mode: "multiply" });
    woodFilter.appendChild(blend);
    defs.appendChild(woodFilter);
    const vig = el("radialGradient", { id: "grad-vignette", cx: "50%", cy: "45%", r: "62%" });
    vig.appendChild(el("stop", { offset: "58%", "stop-color": "#000000", "stop-opacity": 0 }));
    vig.appendChild(el("stop", { offset: "100%", "stop-color": "#2a1e08", "stop-opacity": 0.15 }));
    defs.appendChild(vig);
    const gold = el("radialGradient", { id: "grad-gold", cx: "40%", cy: "35%", r: "70%" });
    gold.appendChild(el("stop", { offset: "0%", "stop-color": "#fff3b0" }));
    gold.appendChild(el("stop", { offset: "60%", "stop-color": "#ffd54f" }));
    gold.appendChild(el("stop", { offset: "100%", "stop-color": "#f9a825" }));
    defs.appendChild(gold);
    svg.appendChild(defs);
  }
  function linearGrad(id, c0, c1, x1, y1, x2, y2) {
    const g = el("linearGradient", { id, x1, y1, x2, y2 });
    g.appendChild(el("stop", { offset: "0%", "stop-color": c0 }));
    g.appendChild(el("stop", { offset: "100%", "stop-color": c1 }));
    return g;
  }
  function drawBase() {
    svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: W, rx: 16, fill: "url(#grad-field)", filter: "url(#wood-grain)" }));
    svg.appendChild(el("rect", { x: 3, y: 3, width: W - 6, height: W - 6, rx: 13, fill: "none", stroke: "url(#grad-frame)", "stroke-width": 6 }));
    svg.appendChild(el("rect", { x: 6.5, y: 6.5, width: W - 13, height: W - 13, rx: 10, fill: "none", stroke: "#ffffff", "stroke-opacity": 0.5, "stroke-width": 1 }));
  }
  function drawVignette() {
    svg.appendChild(el("rect", {
      x: 0,
      y: 0,
      width: W,
      height: W,
      rx: 16,
      fill: "url(#grad-vignette)",
      "pointer-events": "none",
      "aria-hidden": "true"
    }));
  }
  function drawStables() {
    const defs = [
      { color: "red", r: 0, c: 0 },
      { color: "green", r: 0, c: 9 },
      { color: "yellow", r: 9, c: 9 },
      { color: "blue", r: 9, c: 0 }
    ];
    for (const { color, r, c } of defs) {
      const pal = PALETTE[color];
      const x = c * CS, y = r * CS, size = 6 * CS;
      svg.appendChild(el("rect", {
        x: x + 5,
        y: y + 5,
        width: size - 10,
        height: size - 10,
        rx: 14,
        fill: `url(#grad-stable-${color})`,
        stroke: pal.main,
        "stroke-width": 4
      }));
      svg.appendChild(el("rect", {
        x: x + 22,
        y: y + 22,
        width: size - 44,
        height: size - 44,
        rx: 10,
        fill: "#ffffff",
        opacity: 0.45,
        stroke: pal.dark,
        "stroke-width": 1,
        "stroke-dasharray": "4 4"
      }));
      svg.appendChild(el("text", {
        x: x + size / 2,
        y: y + size - 16,
        "text-anchor": "middle",
        fill: pal.dark,
        "font-size": 15,
        "font-weight": "800",
        "font-family": "sans-serif",
        "aria-hidden": "true"
      }, `${HORSE_GLYPH} ${COLOR_NAMES[color].toUpperCase()}`));
      for (const [sr, sc] of STABLE_POSITIONS[color]) {
        svg.appendChild(el("circle", {
          cx: px(sc),
          cy: py(sr),
          r: 16,
          fill: "#ffffff",
          stroke: pal.main,
          "stroke-width": 2,
          opacity: 0.85,
          "aria-hidden": "true"
        }));
      }
    }
  }
  function drawCross() {
    svg.appendChild(el("rect", { x: 0, y: 6 * CS, width: W, height: 3 * CS, fill: "#ffffff" }));
    svg.appendChild(el("rect", { x: 6 * CS, y: 0, width: 3 * CS, height: W, fill: "#ffffff" }));
  }
  function drawTrackCells() {
    for (let i = 0; i < TRACK.length; i++) {
      const [row, col] = TRACK[i];
      const safe = SAFE_ABS.has(i);
      svg.appendChild(el("rect", {
        x: col * CS + 1.5,
        y: row * CS + 1.5,
        width: CS - 3,
        height: CS - 3,
        rx: 5,
        fill: safe ? "#ffe082" : "#ffffff",
        stroke: safe ? "#f9a825" : "#90a4ae",
        "stroke-width": safe ? 2.5 : 1.5
      }));
      if (safe) drawStar(px(col), py(row), 9, 4.2, "#f9a825", "#ff6f00");
      svg.appendChild(el("text", {
        x: col * CS + 5,
        y: row * CS + 12,
        "text-anchor": "start",
        fill: "#37474f",
        "font-size": 10,
        "font-weight": "700",
        "font-family": "sans-serif",
        "aria-hidden": "true"
      }, String(i + 1)));
    }
  }
  function drawStar(x, y, outerR, innerR, fill, stroke) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push(`${x + Math.cos(a) * r},${y + Math.sin(a) * r}`);
    }
    svg.appendChild(el("polygon", {
      points: pts.join(" "),
      fill,
      stroke,
      "stroke-width": 0.75,
      "aria-hidden": "true"
    }));
  }
  function drawHomeColumns() {
    for (const color of COLOR_ORDER) {
      const pal = PALETTE[color];
      for (const [row, col] of HOME[color]) {
        svg.appendChild(el("rect", {
          x: col * CS + 1.5,
          y: row * CS + 1.5,
          width: CS - 3,
          height: CS - 3,
          rx: 5,
          fill: `url(#grad-home-${color})`,
          stroke: pal.dark,
          "stroke-width": 1.5
        }));
      }
    }
  }
  function drawCenter() {
    const cx = 7 * CS + CS / 2, cy = 7 * CS + CS / 2;
    svg.appendChild(el("rect", {
      x: 6 * CS + 3,
      y: 6 * CS + 3,
      width: 3 * CS - 6,
      height: 3 * CS - 6,
      rx: 14,
      fill: "#fffaf0",
      stroke: "#cfd8dc",
      "stroke-width": 1.5
    }));
    const half = 1.5 * CS;
    const x0 = 6 * CS + 6, y0 = 6 * CS + 6, x1 = 9 * CS - 6, y1 = 9 * CS - 6;
    const wedges = [
      { color: "red", pts: `${x0},${y0} ${cx},${cy} ${x0},${y1}` },
      // left
      { color: "green", pts: `${x0},${y0} ${cx},${cy} ${x1},${y0}` },
      // top
      { color: "yellow", pts: `${x1},${y0} ${cx},${cy} ${x1},${y1}` },
      // right
      { color: "blue", pts: `${x0},${y1} ${cx},${cy} ${x1},${y1}` }
      // bottom
    ];
    for (const { color, pts } of wedges) {
      svg.appendChild(el("polygon", { points: pts, fill: PALETTE[color].main, opacity: 0.9, "aria-hidden": "true" }));
    }
    svg.appendChild(el("circle", { cx, cy, r: 20, fill: "url(#grad-gold)", stroke: "#f57f17", "stroke-width": 2, "aria-hidden": "true" }));
    drawStar(cx, cy, 13, 5.5, "#ffffff", "#f9a825");
  }
  function makeHorsePiece(horse) {
    const g = el("g", {
      id: `horse-${horse.color}-${horse.id}`,
      class: `horse horse-${horse.color}`,
      "data-color": horse.color,
      "data-id": horse.id,
      tabindex: "-1",
      role: "button",
      "aria-label": getHorseDescription(horse),
      "aria-disabled": "true"
    });
    g.appendChild(el("circle", { cx: 0, cy: 0, r: 22, fill: "none", "pointer-events": "all" }));
    const vis = el("g", { filter: "url(#piece-shadow)", "aria-hidden": "true" });
    addToken(vis, horse.color, horse.id);
    g.appendChild(vis);
    return g;
  }
  function addToken(vis, color, id) {
    const fill = `url(#grad-token-${color})`;
    const shape = SHAPES[color];
    let numY = 0;
    if (shape === "circle") {
      vis.appendChild(el("circle", { cx: 0, cy: 0, r: 15.5, fill, stroke: "#ffffff", "stroke-width": 2.5 }));
    } else if (shape === "square") {
      vis.appendChild(el("rect", { x: -14.5, y: -14.5, width: 29, height: 29, rx: 6, fill, stroke: "#ffffff", "stroke-width": 2.5 }));
    } else if (shape === "triangle") {
      vis.appendChild(el("polygon", { points: "0,-16.5 15.5,10 -15.5,10", fill, stroke: "#ffffff", "stroke-width": 2.5, "stroke-linejoin": "round" }));
      numY = 3.5;
    } else {
      vis.appendChild(el("polygon", { points: "0,-17 17,0 0,17 -17,0", fill, stroke: "#ffffff", "stroke-width": 2.5, "stroke-linejoin": "round" }));
    }
    vis.appendChild(el("ellipse", { cx: -4.5, cy: -5.5, rx: 5.5, ry: 3.8, fill: "#ffffff", opacity: 0.45 }));
    vis.appendChild(el("text", {
      x: 0,
      y: numY,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-family": "sans-serif",
      "font-size": 17,
      "font-weight": "800",
      fill: "#ffffff",
      stroke: "rgba(0,0,0,0.35)",
      "stroke-width": 0.6,
      "paint-order": "stroke",
      "aria-hidden": "true"
    }, String(id + 1)));
  }
  function positionPiece(piece, horse, instant = false) {
    const [row, col] = getCellCoords(horse);
    if (instant) piece.style.transition = "none";
    piece.style.transform = `translate(${px(col)}px,${py(row)}px)`;
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => {
      piece.style.transition = "";
    }));
    piece.setAttribute("aria-label", getHorseDescription(horse));
    piece.classList.toggle("horse-finished", horse.relPos === FINISHED_REL);
    piece.classList.toggle("horse-stable", horse.relPos === -1);
  }
  function initHorses(horses) {
    horsesLayer.innerHTML = "";
    for (const horse of horses) {
      const piece = makeHorsePiece(horse);
      horsesLayer.appendChild(piece);
      positionPiece(piece, horse, true);
    }
  }
  function moveHorse(horse) {
    const piece = getHorsePiece(horse.color, horse.id);
    if (piece) positionPiece(piece, horse, false);
  }
  function getHorsePiece(color, id) {
    return horsesLayer?.querySelector(`#horse-${color}-${id}`);
  }
  function setMovable(color, horseIds, onSelect) {
    clearHighlights();
    for (const id of horseIds) {
      const piece = getHorsePiece(color, id);
      if (!piece) continue;
      piece.classList.add("can-move");
      piece.setAttribute("tabindex", "0");
      piece.setAttribute("aria-disabled", "false");
      const pick = () => {
        clearHighlights();
        piece.classList.add("selected");
        onSelect(id);
      };
      const onKey = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      };
      piece._pickHandler = pick;
      piece._keyHandler = onKey;
      piece.addEventListener("click", pick);
      piece.addEventListener("keydown", onKey);
    }
    setTimeout(() => {
      const first = getHorsePiece(color, horseIds[0]);
      if (first) first.focus();
    }, 200);
  }
  function updateHorseLabel(color, id, label) {
    const piece = getHorsePiece(color, id);
    if (piece) piece.setAttribute("aria-label", label);
  }
  function clearHighlights() {
    if (!horsesLayer) return;
    horsesLayer.querySelectorAll(".horse").forEach((piece) => {
      piece.classList.remove("can-move", "selected");
      piece.setAttribute("tabindex", "-1");
      piece.setAttribute("aria-disabled", "true");
      if (piece._pickHandler) {
        piece.removeEventListener("click", piece._pickHandler);
        delete piece._pickHandler;
      }
      if (piece._keyHandler) {
        piece.removeEventListener("keydown", piece._keyHandler);
        delete piece._keyHandler;
      }
    });
  }
  function markLastMoved(color, id) {
    clearLastMoved();
    const piece = getHorsePiece(color, id);
    if (piece) piece.classList.add("last-moved");
  }
  function clearLastMoved() {
    if (!horsesLayer) return;
    horsesLayer.querySelectorAll(".horse.last-moved").forEach((p) => p.classList.remove("last-moved"));
  }

  // js/sound.js
  var ctx = null;
  var buffers = /* @__PURE__ */ new Map();
  var decoding = /* @__PURE__ */ new Map();
  var fetched = /* @__PURE__ */ new Map();
  var SOUNDS = [
    "dice-roll",
    "dice-six",
    "move",
    "exit-stable",
    "capture",
    "home-stretch",
    "victory",
    "pass-turn",
    "pass-phone"
  ];
  function loadSounds() {
    for (const name of SOUNDS) {
      fetched.set(
        name,
        fetch(`sounds/${name}.mp3`).then((r) => r.arrayBuffer()).catch(() => null)
      );
    }
  }
  function decodeSound(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (decoding.has(name)) return decoding.get(name);
    if (!ctx) return Promise.resolve(null);
    const p = (async () => {
      try {
        const raw = await fetched.get(name);
        if (!raw) return null;
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
  function unlockAudio() {
    if (!ctx) {
      try {
        ctx = new AudioContext();
      } catch (e) {
        return;
      }
      for (const name of SOUNDS) decodeSound(name);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {
    });
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
  function play(name) {
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {
    });
    const buf = buffers.get(name);
    if (buf) {
      playBuffer(buf);
      return;
    }
    decodeSound(name).then((b) => {
      if (b && ctx && ctx.state !== "closed") playBuffer(b);
    });
  }

  // js/ui.js
  var $ = (id) => document.getElementById(id);
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => {
      s.hidden = true;
      s.setAttribute("aria-hidden", "true");
    });
    const screen = $(`screen-${name}`);
    screen.hidden = false;
    screen.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      const focusable = screen.querySelector('button, [tabindex="0"], input, select');
      if (focusable) focusable.focus();
    });
  }
  function initSetupScreen(onStart) {
    const startBtn = $("btn-start");
    startBtn.addEventListener("click", () => {
      const count = parseInt($("player-count").value, 10);
      const aiMode = $("ai-mode").value === "ai";
      const winMode = $("win-mode").value;
      const difficulty = $("ai-difficulty")?.value || "normal";
      onStart(count, aiMode, winMode, difficulty);
    });
    ["player-count", "win-mode", "ai-difficulty"].forEach((id) => {
      const sel = $(id);
      if (sel) sel.addEventListener("change", () => sel.focus());
    });
    const aiSelect = $("ai-mode");
    const diffGroup = $("difficulty-group");
    if (aiSelect && diffGroup) {
      const toggle = (fromUser = false) => {
        diffGroup.hidden = aiSelect.value !== "ai";
        if (fromUser) aiSelect.focus();
      };
      aiSelect.addEventListener("change", () => toggle(true));
      toggle();
    }
  }
  function updateTurnBanner(color, phase, diceValue) {
    const pal = {
      red: "#c62828",
      green: "#2e7d32",
      yellow: "#f57f17",
      blue: "#1565c0"
    };
    const banner = $("turn-banner");
    banner.textContent = `Tour de ${COLOR_NAMES[color]}`;
    banner.style.color = pal[color];
    const diceArea = $("dice-result");
    if (diceValue !== null) {
      diceArea.textContent = diceValue;
      diceArea.setAttribute("aria-label", `R\xE9sultat du d\xE9 : ${diceValue}`);
    } else {
      diceArea.textContent = "";
      diceArea.removeAttribute("aria-label");
    }
  }
  function setDiceEnabled(enabled) {
    const btn = $("btn-dice");
    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", String(!enabled));
  }
  function initDiceButton(onClick) {
    $("btn-dice").addEventListener("click", onClick);
  }
  function animateDice(finalValue, callback) {
    const btn = $("btn-dice");
    const face = $("dice-face");
    btn.classList.add("rolling");
    let ticks = 0;
    const interval = setInterval(() => {
      face.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
      if (++ticks >= 8) {
        clearInterval(interval);
        face.textContent = DICE_FACES[finalValue - 1];
        btn.classList.remove("rolling");
        callback();
      }
    }, 80);
  }
  function showWinner(color, scores, nameMap) {
    const displayName = nameMap && nameMap[color] || COLOR_NAMES[color];
    $("winner-name").textContent = displayName;
    $("winner-name").style.color = {
      red: "#c62828",
      green: "#2e7d32",
      yellow: "#f57f17",
      blue: "#1565c0"
    }[color];
    const scoresEl = $("winner-scores");
    if (scores) {
      const parts = Object.entries(scores).filter(([, s]) => s > 0).map(([c, s]) => {
        const n = nameMap && nameMap[c] || COLOR_NAMES[c];
        return `${n}: ${s} victoire${s > 1 ? "s" : ""}`;
      });
      scoresEl.textContent = parts.length > 0 ? `Scores: ${parts.join(", ")}` : "";
    } else {
      scoresEl.textContent = "";
    }
    showScreen("winner");
    announce(`Victoire ! ${displayName} a gagn\xE9 la partie !`, true);
  }
  function initWinnerScreen(onRestart) {
    $("btn-restart").addEventListener("click", onRestart);
  }
  var lastAnnouncement = "";
  var politeToggle = false;
  function announce(message, urgent = false) {
    lastAnnouncement = message;
    if (urgent) {
      const region = $("aria-alert");
      region.textContent = "";
      requestAnimationFrame(() => {
        region.textContent = message;
      });
    } else {
      politeToggle = !politeToggle;
      const activeId = politeToggle ? "aria-status-a" : "aria-status-b";
      const inactiveId = politeToggle ? "aria-status-b" : "aria-status-a";
      $(inactiveId).textContent = "";
      const active = $(activeId);
      active.textContent = "";
      requestAnimationFrame(() => {
        active.textContent = message;
      });
    }
  }
  function repeatLastAnnouncement() {
    if (lastAnnouncement) announce(lastAnnouncement);
  }
  function initRepeatButton(onClick) {
    $("btn-repeat").addEventListener("click", onClick);
  }
  function initSituationButton(onClick) {
    $("btn-situation").addEventListener("click", onClick);
  }
  function initQuitButton(onClick) {
    $("btn-quit").addEventListener("click", onClick);
  }
  var LOG_PAL = {
    red: "#c62828",
    green: "#2e7d32",
    yellow: "#ef6c00",
    blue: "#1565c0"
  };
  function clearEventLog() {
    const list = $("event-log-list");
    if (!list) return;
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "event-log-empty";
    li.textContent = "La partie commence\u2026";
    list.appendChild(li);
  }
  function logEvent(text, color, capture = false) {
    const list = $("event-log-list");
    if (!list) return;
    const placeholder = list.querySelector(".event-log-empty");
    if (placeholder) placeholder.remove();
    const li = document.createElement("li");
    if (color) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = LOG_PAL[color] || "#888";
      li.appendChild(dot);
    }
    const span = document.createElement("span");
    if (capture) span.className = "capture";
    span.textContent = text;
    li.appendChild(span);
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 40) list.removeChild(list.lastChild);
  }
  function initResumeButton(onResume) {
    const btn = $("btn-resume");
    if (btn) btn.addEventListener("click", onResume);
  }
  function showResumeButton(visible) {
    const btn = $("btn-resume");
    if (btn) btn.hidden = !visible;
  }
  var STATS_KEY = "petits-chevaux-stats";
  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "\u2014";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
  }
  function renderStats() {
    const container = $("stats-content");
    const clearBtn = $("btn-stats-clear");
    if (!container) return;
    let stats = [];
    try {
      stats = JSON.parse(localStorage.getItem(STATS_KEY) || "[]");
    } catch {
    }
    if (stats.length === 0) {
      container.innerHTML = `<p class="stats-summary" style="text-align:center">Aucune partie termin\xE9e pour l'instant.</p>`;
      if (clearBtn) clearBtn.hidden = true;
      return;
    }
    const total = stats.length;
    const aiGames = stats.filter((s) => s.aiMode);
    const aiWins = aiGames.filter((s) => s.winner === "red");
    const avgDuration = Math.round(stats.reduce((a, s) => a + (s.duration || 0), 0) / total);
    let html = '<div class="stats-summary">';
    html += `<p><strong>${total}</strong> partie${total > 1 ? "s" : ""} termin\xE9e${total > 1 ? "s" : ""}</p>`;
    if (aiGames.length > 0) {
      const pct = Math.round(aiWins.length / aiGames.length * 100);
      html += `<p>Contre l'IA : <strong>${aiWins.length}/${aiGames.length}</strong> victoire${aiWins.length > 1 ? "s" : ""} (${pct} %)</p>`;
    }
    html += `<p>Dur\xE9e moyenne : <strong>${formatDuration(avgDuration)}</strong></p>`;
    html += "</div>";
    html += '<p class="stats-subtitle">Derni\xE8res parties</p>';
    html += '<ul class="stats-list">';
    const recent = stats.slice(-10).reverse();
    for (const s of recent) {
      const date = new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      const diff = { easy: "facile", normal: "normal", hard: "difficile" };
      const mode = s.aiMode ? `IA ${diff[s.aiDifficulty] || "normal"}` : `${s.playerCount} humains`;
      const dur = s.duration ? ` \u2014 ${formatDuration(s.duration)}` : "";
      html += `<li>${date} \u2014 ${s.winnerLabel || s.winner} gagne (${mode})${dur}</li>`;
    }
    html += "</ul>";
    container.innerHTML = html;
    if (clearBtn) clearBtn.hidden = false;
  }
  function initStatsScreen(onBack) {
    const backBtn = $("btn-stats-back");
    if (backBtn) backBtn.addEventListener("click", onBack);
    const statsBtn = $("btn-stats");
    if (statsBtn) {
      statsBtn.addEventListener("click", () => {
        renderStats();
        showScreen("stats");
      });
    }
    const clearBtn = $("btn-stats-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        try {
          localStorage.removeItem(STATS_KEY);
        } catch {
        }
        renderStats();
      });
    }
  }
  var THEME_KEY = "petits-chevaux-theme";
  var THEME_LABELS = { auto: "Th\xE8me : Auto", light: "Th\xE8me : Clair", dark: "Th\xE8me : Sombre" };
  var THEME_CYCLE = ["auto", "light", "dark"];
  function applyThemeClass(theme) {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    if (theme === "light") document.documentElement.classList.add("theme-light");
    else if (theme === "dark") document.documentElement.classList.add("theme-dark");
  }
  function initThemeToggle() {
    let current = "auto";
    try {
      current = localStorage.getItem(THEME_KEY) || "auto";
    } catch {
    }
    applyThemeClass(current);
    const btn = $("btn-theme");
    if (!btn) return;
    btn.textContent = THEME_LABELS[current] || THEME_LABELS.auto;
    btn.addEventListener("click", () => {
      const idx = THEME_CYCLE.indexOf(current);
      current = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
      applyThemeClass(current);
      btn.textContent = THEME_LABELS[current];
      try {
        localStorage.setItem(THEME_KEY, current);
      } catch {
      }
    });
  }
  var SHAKE_KEY = "petits-chevaux-shake";
  var shakeEnabled = true;
  function isShakeEnabled() {
    return shakeEnabled;
  }
  function initShakeToggle(onEnable) {
    try {
      shakeEnabled = localStorage.getItem(SHAKE_KEY) !== "off";
    } catch {
    }
    const btn = $("btn-shake");
    if (!btn) return;
    const render = () => {
      btn.textContent = shakeEnabled ? "Secouer pour lancer : Activ\xE9" : "Secouer pour lancer : D\xE9sactiv\xE9";
    };
    render();
    btn.addEventListener("click", () => {
      shakeEnabled = !shakeEnabled;
      try {
        localStorage.setItem(SHAKE_KEY, shakeEnabled ? "on" : "off");
      } catch {
      }
      render();
      if (shakeEnabled && onEnable) onEnable();
    });
  }
  var DICE_FACES = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];

  // js/online.js
  var NAME_KEY = "petits-chevaux-player-name";
  var COLOR_ORDER2 = ["red", "green", "yellow", "blue"];
  var db = null;
  var auth = null;
  var currentUser = null;
  var currentRoomId = null;
  var hostFlag = false;
  var cleanupFns = [];
  function fb() {
    return window.firebase;
  }
  function isFirebaseAvailable() {
    return !!fb();
  }
  function initFirebase() {
    if (db) return;
    const f = fb();
    if (!f) return;
    f.initializeApp({
      apiKey: "AIzaSyBKEtNjA0JOwUSP1lUjxXWHkkK_pDZPf_c",
      authDomain: "petits-chevaux-online.firebaseapp.com",
      databaseURL: "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "petits-chevaux-online",
      appId: "1:275251725173:web:06839fa2ae3f087a89093c"
    });
    db = f.database();
    auth = f.auth();
  }
  async function signIn() {
    if (currentUser) return currentUser;
    initFirebase();
    const cred = await auth.signInAnonymously();
    currentUser = cred.user;
    return currentUser;
  }
  function getUid() {
    return currentUser?.uid || null;
  }
  function isHost() {
    return hostFlag;
  }
  function getSavedName() {
    try {
      return localStorage.getItem(NAME_KEY) || "";
    } catch {
      return "";
    }
  }
  function saveName(name) {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
    }
  }
  function generateCode() {
    let code = "";
    for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
    return code;
  }
  async function createRoom({ playerName, maxPlayers, isPublic, winMode }) {
    await signIn();
    saveName(playerName);
    const roomRef = db.ref("rooms").push();
    const roomId = roomRef.key;
    const code = isPublic ? null : generateCode();
    const config = {
      hostId: currentUser.uid,
      hostName: playerName,
      maxPlayers,
      public: isPublic,
      createdAt: fb().database.ServerValue.TIMESTAMP,
      winMode: winMode || "all"
    };
    if (code) config.code = code;
    const updates = {};
    updates["rooms/" + roomId + "/config"] = config;
    updates["rooms/" + roomId + "/status"] = "waiting";
    updates["rooms/" + roomId + "/players/" + currentUser.uid] = {
      name: playerName,
      color: "red",
      connected: true,
      lastSeen: fb().database.ServerValue.TIMESTAMP
    };
    if (isPublic) {
      updates["publicRooms/" + roomId] = {
        hostName: playerName,
        playerCount: 1,
        maxPlayers,
        code: "",
        winMode: winMode || "all"
      };
    }
    if (code) updates["roomCodes/" + code] = roomId;
    await db.ref().update(updates);
    const playerRef = db.ref("rooms/" + roomId + "/players/" + currentUser.uid);
    playerRef.child("connected").onDisconnect().set(false);
    playerRef.child("lastSeen").onDisconnect().set(fb().database.ServerValue.TIMESTAMP);
    db.ref("rooms/" + roomId).onDisconnect().remove();
    db.ref("publicRooms/" + roomId).onDisconnect().remove();
    if (code) db.ref("roomCodes/" + code).onDisconnect().remove();
    currentRoomId = roomId;
    hostFlag = true;
    return { roomId, code };
  }
  async function joinRoom(roomId, playerName) {
    await signIn();
    saveName(playerName);
    const roomRef = db.ref("rooms/" + roomId);
    const [configSnap, playersSnap, statusSnap] = await Promise.all([
      roomRef.child("config").once("value"),
      roomRef.child("players").once("value"),
      roomRef.child("status").once("value")
    ]);
    const config = configSnap.val();
    if (!config) throw new Error("Plateau introuvable.");
    if (statusSnap.val() !== "waiting") throw new Error("La partie a d\xE9j\xE0 commenc\xE9.");
    const players = playersSnap.val() || {};
    if (players[currentUser.uid]) {
      await roomRef.child("players/" + currentUser.uid + "/connected").set(true);
      currentRoomId = roomId;
      hostFlag = config.hostId === currentUser.uid;
      setupPresence(roomId);
      return { roomId, color: players[currentUser.uid].color, config };
    }
    const count = Object.keys(players).length;
    if (count >= config.maxPlayers) throw new Error("Le plateau est complet.");
    const usedColors = new Set(Object.values(players).map((p) => p.color));
    const myColor2 = COLOR_ORDER2.find((c) => !usedColors.has(c));
    if (!myColor2) throw new Error("Plus de couleur disponible.");
    await roomRef.child("players/" + currentUser.uid).set({
      name: playerName,
      color: myColor2,
      connected: true,
      lastSeen: fb().database.ServerValue.TIMESTAMP
    });
    if (config.public) {
      db.ref("publicRooms/" + roomId + "/playerCount").set(count + 1);
    }
    setupPresence(roomId);
    currentRoomId = roomId;
    hostFlag = false;
    return { roomId, color: myColor2, config };
  }
  async function joinRoomByCode(code, playerName) {
    await signIn();
    const snap = await db.ref("roomCodes/" + code).once("value");
    const roomId = snap.val();
    if (!roomId) throw new Error("Code invalide.");
    return joinRoom(roomId, playerName);
  }
  function setupPresence(roomId) {
    const playerRef = db.ref("rooms/" + roomId + "/players/" + currentUser.uid);
    playerRef.child("connected").onDisconnect().set(false);
    playerRef.child("lastSeen").onDisconnect().set(fb().database.ServerValue.TIMESTAMP);
  }
  function listenPublicRooms(callback) {
    initFirebase();
    if (!db) {
      callback([]);
      return () => {
      };
    }
    const ref = db.ref("publicRooms").limitToLast(20);
    const handler = ref.on("value", (snap) => {
      const rooms = [];
      snap.forEach((child) => {
        const val = child.val();
        if (val && val.playerCount < val.maxPlayers) {
          rooms.push({ id: child.key, ...val });
        }
      });
      callback(rooms);
    });
    const unsub = () => ref.off("value", handler);
    cleanupFns.push(unsub);
    return unsub;
  }
  function listenRoom(roomId, callbacks) {
    const roomRef = db.ref("rooms/" + roomId);
    const handlers = [];
    if (callbacks.onPlayers) {
      const h = roomRef.child("players").on("value", (snap) => callbacks.onPlayers(snap.val() || {}));
      handlers.push(() => roomRef.child("players").off("value", h));
    }
    if (callbacks.onStatus) {
      const h = roomRef.child("status").on("value", (snap) => callbacks.onStatus(snap.val()));
      handlers.push(() => roomRef.child("status").off("value", h));
    }
    if (callbacks.onGameState) {
      const h = roomRef.child("gameState").on("value", (snap) => callbacks.onGameState(snap.val()));
      handlers.push(() => roomRef.child("gameState").off("value", h));
    }
    cleanupFns.push(...handlers);
    return () => handlers.forEach((fn) => fn());
  }
  async function writeGameState(gs) {
    if (!currentRoomId) return;
    await db.ref("rooms/" + currentRoomId + "/gameState").set(gs);
  }
  async function setRoomStatus(status) {
    if (!currentRoomId) return;
    await db.ref("rooms/" + currentRoomId + "/status").set(status);
    if (status === "playing" || status === "finished") {
      db.ref("publicRooms/" + currentRoomId).remove();
    }
  }
  async function leaveRoom() {
    if (!currentRoomId || !currentUser) return;
    const roomRef = db.ref("rooms/" + currentRoomId);
    roomRef.child("players/" + currentUser.uid + "/connected").onDisconnect().cancel();
    roomRef.child("players/" + currentUser.uid + "/lastSeen").onDisconnect().cancel();
    roomRef.onDisconnect().cancel();
    db.ref("publicRooms/" + currentRoomId).onDisconnect().cancel();
    const configSnap = await roomRef.child("config").once("value");
    const config = configSnap.val();
    if (config && config.hostId === currentUser.uid) {
      const updates = {};
      updates["rooms/" + currentRoomId] = null;
      updates["publicRooms/" + currentRoomId] = null;
      if (config.code) updates["roomCodes/" + config.code] = null;
      await db.ref().update(updates);
    } else {
      await roomRef.child("players/" + currentUser.uid).remove();
      if (config && config.public) {
        const playersSnap = await roomRef.child("players").once("value");
        db.ref("publicRooms/" + currentRoomId + "/playerCount").set(playersSnap.numChildren());
      }
    }
    cleanupAll();
    currentRoomId = null;
    hostFlag = false;
  }
  function cleanupAll() {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
  }

  // js/main.js
  var state = null;
  var aiPlayers = /* @__PURE__ */ new Set();
  var aiNames = {};
  var sessionScores = {};
  var aiDifficulty = "normal";
  var turnCount = 0;
  var gameStartTime = 0;
  var isOnline = false;
  var myColor = null;
  var onlineSeq = -1;
  var onlinePlayersMap = {};
  var roomUnsub = null;
  var onlineName = "";
  var lastOnlineAction = null;
  var AI_NAMES = ["Bernard", "C\xE9line", "Marie"];
  var SAVE_KEY = "petits-chevaux-save";
  var STATS_KEY2 = "petits-chevaux-stats";
  var $2 = (id) => document.getElementById(id);
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
  function saveGame() {
    if (!state || state.phase === "game-over" || isOnline) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        state,
        aiPlayers: [...aiPlayers],
        aiNames,
        sessionScores,
        turnCount,
        gameStartTime,
        aiDifficulty
      }));
    } catch {
    }
  }
  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
    }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function recordStats(winnerColor) {
    try {
      const stats = JSON.parse(localStorage.getItem(STATS_KEY2) || "[]");
      stats.push({
        date: (/* @__PURE__ */ new Date()).toISOString(),
        winner: winnerColor,
        winnerLabel: playerLabel(winnerColor),
        playerCount: state.players.length,
        aiMode: aiPlayers.size > 0,
        aiDifficulty,
        winMode: state.winMode,
        turns: turnCount,
        duration: Math.round((Date.now() - gameStartTime) / 1e3),
        online: isOnline
      });
      while (stats.length > 100) stats.shift();
      localStorage.setItem(STATS_KEY2, JSON.stringify(stats));
    } catch {
    }
  }
  function cellShort(horse) {
    const r = horse.relPos;
    if (r === -1) return "\xE9curie";
    if (r === FINISHED_REL) return "centre";
    if (r >= 52) return `couloir ${r - 51}`;
    return `case ${getAbsPos(horse) + 1}`;
  }
  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  var SHAKE_THRESHOLD = 15;
  var SHAKE_COOLDOWN = 1200;
  var lastShake = 0;
  var motionListenerAdded = false;
  var motionRequestedThisSession = false;
  function onDeviceMotion(e) {
    if (!isShakeEnabled()) return;
    if (!state || state.phase !== "rolling" || aiPlayers.has(state.currentColor)) return;
    if (isOnline && state.currentColor !== myColor) return;
    const btn = $2("btn-dice");
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
    if (!isShakeEnabled()) return;
    if (typeof DeviceMotionEvent === "undefined") return;
    if (motionListenerAdded) return;
    if (motionRequestedThisSession) return;
    motionRequestedThisSession = true;
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== "granted") return;
      } catch (e) {
        return;
      }
    }
    window.addEventListener("devicemotion", onDeviceMotion);
    motionListenerAdded = true;
  }
  window.addEventListener("DOMContentLoaded", () => {
    loadSounds();
    initThemeToggle();
    initShakeToggle(() => {
      motionRequestedThisSession = false;
      requestMotionPermission();
    });
    createBoard($2("board-container"));
    initSetupScreen(startGame);
    initDiceButton(onDiceClick);
    initWinnerScreen(() => {
      if (isOnline) {
        leaveRoom();
        resetOnline();
      }
      showResumeButton(false);
      showScreen("setup");
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
      showScreen("setup");
    });
    initResumeButton(resumeGame);
    initStatsScreen(() => showScreen("setup"));
    initOnlineScreens();
    document.addEventListener("keydown", handleKeyboard);
    showResumeButton(!!loadSave());
    showScreen("setup");
  });
  function handleKeyboard(e) {
    if (!e.altKey || !e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) return;
    switch (e.code) {
      case "KeyD":
        if (state && state.phase === "rolling" && !aiPlayers.has(state.currentColor)) {
          if (isOnline && state.currentColor !== myColor) break;
          e.preventDefault();
          const btn = $2("btn-dice");
          if (!btn.disabled) onDiceClick();
        }
        break;
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
        if (state && state.phase === "selecting" && !aiPlayers.has(state.currentColor)) {
          if (isOnline && state.currentColor !== myColor) break;
          e.preventDefault();
          const id = parseInt(e.code.replace("Digit", "")) - 1;
          if (state.validMoveIds.includes(id)) onHorseSelected(id);
        }
        break;
      case "KeyS":
        if (state) {
          e.preventDefault();
          announce(getFullSituation(state));
        }
        break;
      case "KeyQ":
        e.preventDefault();
        repeatLastAnnouncement();
        break;
    }
  }
  function startGame(playerCount, isAiMode, winMode, difficulty) {
    unlockAudio();
    requestMotionPermission();
    isOnline = false;
    myColor = null;
    aiDifficulty = difficulty || "normal";
    turnCount = 0;
    gameStartTime = Date.now();
    state = createGame(playerCount, winMode);
    aiPlayers = /* @__PURE__ */ new Set();
    aiNames = {};
    if (isAiMode) {
      state.players.slice(1).forEach((color, i) => {
        aiPlayers.add(color);
        aiNames[color] = AI_NAMES[i] || `IA ${i + 1}`;
      });
    }
    state.players.forEach((color) => {
      if (!(color in sessionScores)) sessionScores[color] = 0;
    });
    initHorses(state.horses);
    clearEventLog();
    showScreen("game");
    play("exit-stable");
    beginTurn();
  }
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
    aiDifficulty = data.aiDifficulty || "normal";
    initHorses(state.horses);
    clearEventLog();
    showScreen("game");
    state.phase = "rolling";
    state.lastDice = null;
    state.validMoveIds = [];
    announce("Partie reprise.", true);
    beginTurn();
  }
  function beginTurn() {
    turnCount++;
    state.phase = "rolling";
    state.lastDice = null;
    state.validMoveIds = [];
    updateTurnBanner(state.currentColor, state.phase, null);
    if (isOnline) {
      const detail = lastOnlineAction ? { prevType: lastOnlineAction.type, prevColor: lastOnlineAction.color, prevEvents: lastOnlineAction.events } : {};
      lastOnlineAction = null;
      syncOnlineState("turn-start", detail);
      if (state.currentColor !== myColor) {
        setDiceEnabled(false);
        announce(`Tour de ${onlinePlayerName(state.currentColor)}.`);
        return;
      }
      setDiceEnabled(true);
      const summary2 = getTurnSummary(state);
      announce(`Votre tour ! ${summary2}. Lancez le d\xE9.`);
      setTimeout(() => $2("btn-dice").focus(), 50);
      return;
    }
    const colorName = COLOR_NAMES[state.currentColor];
    const summary = getTurnSummary(state);
    if (aiPlayers.has(state.currentColor)) {
      setDiceEnabled(false);
      announce(`${aiNames[state.currentColor]} joue pour ${colorName}.`);
      setTimeout(aiPlayTurn, 1800);
    } else {
      setDiceEnabled(true);
      announce(`Tour de ${colorName}. ${summary}. Lancez le d\xE9.`);
      setTimeout(() => $2("btn-dice").focus(), 50);
    }
    saveGame();
  }
  function aiPlayTurn() {
    play("dice-roll");
    vibrate(50);
    const value = rollDice();
    state.lastDice = value;
    animateDice(value, () => {
      if (value === 6) state.consecutiveSixes++;
      else state.consecutiveSixes = 0;
      logEvent(`${COLOR_NAMES[state.currentColor]} lance ${value}`, state.currentColor);
      if (state.consecutiveSixes >= 3) {
        state.consecutiveSixes = 0;
        play("pass-turn");
        vibrate([200, 100, 200]);
        updateTurnBanner(state.currentColor, state.phase, value);
        const penalized = applyTripleSixPenalty(state);
        if (penalized) {
          moveHorse(penalized);
          markLastMoved(state.currentColor, penalized.id);
          announce(
            `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne \xE0 l'\xE9curie. Tour de ${aiNames[state.currentColor]} perdu.`,
            true
          );
          logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6 ! cheval ${penalized.id + 1} \u2192 \xE9curie`, state.currentColor);
        } else {
          announce(`Trois 6 de suite ! Tour de ${aiNames[state.currentColor]} perdu.`, true);
          logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6, tour perdu`, state.currentColor);
        }
        setTimeout(() => endTurn(false), 2e3);
        return;
      }
      if (value === 6) {
        play("dice-six");
        vibrate([80, 40, 80]);
      }
      const ids = getValidMoves(state, value);
      state.validMoveIds = ids;
      updateTurnBanner(state.currentColor, state.phase, value);
      if (ids.length === 0) {
        announce(`${playerLabel(state.currentColor)} lance ${value}. Aucun mouvement possible.`, true);
        logEvent(`${COLOR_NAMES[state.currentColor]} : aucun mouvement`, state.currentColor);
        play("pass-turn");
        vibrate([30, 30, 30]);
        setTimeout(() => endTurn(false), 1200);
        return;
      }
      state.phase = "selecting";
      announce(`${playerLabel(state.currentColor)} lance ${value}.`);
      setTimeout(() => {
        const chosenId = getAIMove(state, value, aiDifficulty);
        onHorseSelected(chosenId);
      }, 800);
    });
  }
  function onDiceClick() {
    if (state.phase !== "rolling") return;
    if (isOnline && state.currentColor !== myColor) return;
    unlockAudio();
    setDiceEnabled(false);
    play("dice-roll");
    vibrate(50);
    const value = rollDice();
    state.lastDice = value;
    animateDice(value, () => {
      if (value === 6) state.consecutiveSixes++;
      else state.consecutiveSixes = 0;
      logEvent(`${COLOR_NAMES[state.currentColor]} lance ${value}`, state.currentColor);
      if (state.consecutiveSixes >= 3) {
        state.consecutiveSixes = 0;
        play("pass-turn");
        vibrate([200, 100, 200]);
        updateTurnBanner(state.currentColor, state.phase, value);
        const penalized = applyTripleSixPenalty(state);
        if (penalized) {
          moveHorse(penalized);
          markLastMoved(state.currentColor, penalized.id);
          announce(
            `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne \xE0 l'\xE9curie. Tour perdu.`,
            true
          );
          logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6 ! cheval ${penalized.id + 1} \u2192 \xE9curie`, state.currentColor);
        } else {
          announce(`Trois 6 de suite ! Tour perdu.`, true);
          logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6, tour perdu`, state.currentColor);
        }
        if (isOnline) lastOnlineAction = { type: "penalty", color: state.currentColor, events: ["penalty"] };
        setTimeout(() => endTurn(false), 2e3);
        return;
      }
      if (value === 6) {
        play("dice-six");
        vibrate([80, 40, 80]);
      }
      const ids = getValidMoves(state, value);
      state.validMoveIds = ids;
      const colorName = COLOR_NAMES[state.currentColor];
      updateTurnBanner(state.currentColor, state.phase, value);
      if (ids.length === 0) {
        announce(`${colorName} lance ${value}. Aucun mouvement possible.`, true);
        logEvent(`${colorName} : aucun mouvement`, state.currentColor);
        play("pass-turn");
        vibrate([30, 30, 30]);
        if (isOnline) lastOnlineAction = { type: "pass", color: state.currentColor, events: [] };
        setTimeout(() => endTurn(false), 1200);
        return;
      }
      state.phase = "selecting";
      if (isOnline) syncOnlineState("dice", { dice: value, playerColor: state.currentColor });
      if (ids.length === 1) {
        announce(`${colorName} lance ${value}. Un seul cheval peut bouger.`);
        const horse = state.horses.find((h) => h.color === state.currentColor && h.id === ids[0]);
        updateHorseLabel(state.currentColor, ids[0], getMoveLabel(state, horse, value));
        setTimeout(() => onHorseSelected(ids[0]), 300);
      } else {
        announce(`${colorName} lance ${value}. ${ids.length} chevaux peuvent bouger.`);
        ids.forEach((id) => {
          const horse = state.horses.find((h) => h.color === state.currentColor && h.id === id);
          updateHorseLabel(state.currentColor, id, getMoveLabel(state, horse, value));
        });
        setMovable(state.currentColor, ids, onHorseSelected);
      }
    });
  }
  function onHorseSelected(horseId) {
    if (state.phase !== "selecting") return;
    state.phase = "animating";
    clearHighlights();
    setDiceEnabled(false);
    const dice = state.lastDice;
    const events = applyMove(state, horseId, dice);
    let hadCapture = false;
    let moverCell = "";
    const eventTypes = [];
    for (const ev of events) {
      eventTypes.push(ev.type);
      if (ev.type === "exit-stable" || ev.type === "move") {
        const horse = state.horses.find((h) => h.color === ev.color && h.id === ev.horseId);
        moveHorse(horse);
        markLastMoved(ev.color, ev.horseId);
        if (ev.bounced) {
          play("move");
          vibrate([30, 20, 30]);
          moverCell = `couloir ${horse.relPos - 51}`;
          announce(
            `Rebond ! Cheval ${COLOR_NAMES[ev.color]} ${ev.horseId + 1} recule \xE0 la case ${horse.relPos - 51} du couloir.`
          );
          logEvent(`${COLOR_NAMES[ev.color]} : cheval ${ev.horseId + 1} rebond \u2192 ${moverCell}`, ev.color);
        } else {
          play(ev.type);
          vibrate(ev.type === "exit-stable" ? 80 : 30);
          moverCell = cellShort(horse);
          logEvent(`${COLOR_NAMES[ev.color]} : cheval ${ev.horseId + 1} \u2192 ${moverCell}`, ev.color);
        }
      }
      if (ev.type === "capture") {
        hadCapture = true;
        const captured = state.horses.find((h) => h.color === ev.capturedColor && h.id === ev.capturedId);
        moveHorse(captured);
        play("capture");
        vibrate([100, 50, 150]);
        const replayMsg = isOnline && ev.byColor === myColor || !isOnline && !aiPlayers.has(ev.byColor) ? "Vous rejouez !" : `${playerLabel(ev.byColor)} rejoue !`;
        announce(
          `Capture ! Cheval ${COLOR_NAMES[ev.capturedColor]} renvoy\xE9 \xE0 l'\xE9curie. ${replayMsg}`,
          true
        );
        logEvent(
          `${COLOR_NAMES[ev.byColor]} capture ${COLOR_NAMES[ev.capturedColor]}${moverCell ? " (" + moverCell + ")" : ""}`,
          ev.byColor,
          true
        );
      }
      if (ev.type === "home-stretch") {
        play("home-stretch");
        vibrate([50, 30, 50]);
        announce(`${playerLabel(ev.color)} entre dans le couloir d'arriv\xE9e !`);
      }
      if (ev.type === "win") {
        sessionScores[ev.color] = (sessionScores[ev.color] || 0) + 1;
        recordStats(ev.color);
        clearSave();
        logEvent(`${COLOR_NAMES[ev.color]} gagne la partie !`, ev.color);
        const nameMap = {};
        state.players.forEach((c) => {
          nameMap[c] = playerLabel(c);
        });
        if (isOnline) {
          syncOnlineState("win", { winner: ev.color });
          setRoomStatus("finished");
        }
        setTimeout(() => {
          play("victory");
          vibrate([100, 50, 100, 50, 300]);
          showWinner(ev.color, isOnline ? {} : sessionScores, nameMap);
        }, 600);
        return;
      }
    }
    if (isOnline) {
      lastOnlineAction = { type: "move", color: state.currentColor, events: eventTypes };
    }
    const extraTurn = dice === 6 || hadCapture;
    setTimeout(() => endTurn(extraTurn), 600);
  }
  function endTurn(extraTurn) {
    if (extraTurn) {
      announce(`${playerLabel(state.currentColor)} rejoue !`);
      beginTurn();
      return;
    }
    advanceTurn(state);
    beginTurn();
  }
  function syncOnlineState(actionType, detail = {}) {
    if (!isOnline) return;
    onlineSeq++;
    writeGameState({
      horses: state.horses.map((h) => ({ color: h.color, id: h.id, relPos: h.relPos })),
      currentColor: state.currentColor,
      phase: state.phase,
      lastDice: state.lastDice,
      consecutiveSixes: state.consecutiveSixes || 0,
      validMoveIds: state.validMoveIds || [],
      players: state.players,
      winMode: state.winMode,
      seq: onlineSeq,
      lastAction: { type: actionType, uid: getUid(), ...detail }
    });
  }
  function onRemoteGameState(gs) {
    if (!gs || !isOnline || !state) return;
    if (gs.seq <= onlineSeq) return;
    onlineSeq = gs.seq;
    const isMyAction = gs.lastAction && gs.lastAction.uid === getUid();
    if (isMyAction) return;
    for (const gh of gs.horses) {
      const h = state.horses.find((x) => x.color === gh.color && x.id === gh.id);
      if (h) h.relPos = gh.relPos;
    }
    state.currentColor = gs.currentColor;
    state.phase = gs.phase;
    state.lastDice = gs.lastDice;
    state.consecutiveSixes = gs.consecutiveSixes || 0;
    state.validMoveIds = gs.validMoveIds || [];
    state.horses.forEach((h) => moveHorse(h));
    updateTurnBanner(state.currentColor, state.phase, state.lastDice);
    const action = gs.lastAction;
    if (action) {
      if (action.type === "dice") {
        play("dice-roll");
        vibrate(50);
        if (action.dice === 6) {
          play("dice-six");
          vibrate([80, 40, 80]);
        }
        const name = onlinePlayerName(action.playerColor || gs.currentColor);
        announce(`${name} lance ${action.dice}.`);
        logEvent(`${COLOR_NAMES[action.playerColor || gs.currentColor]} lance ${action.dice}`, action.playerColor || gs.currentColor);
      }
      if (action.type === "turn-start" && action.prevType) {
        if (action.prevEvents) {
          for (const et of action.prevEvents) {
            if (et === "capture") play("capture");
            else if (et === "home-stretch") play("home-stretch");
            else if (et === "exit-stable") play("exit-stable");
            else if (et === "move" || et === "exit-stable") play("move");
          }
        }
        if (action.prevType === "pass") {
          play("pass-turn");
          logEvent(`${COLOR_NAMES[action.prevColor]} : aucun mouvement`, action.prevColor);
        }
        if (action.prevType === "penalty") {
          play("pass-turn");
          logEvent(`${COLOR_NAMES[action.prevColor]} : trois 6, tour perdu`, action.prevColor);
        }
        if (action.prevType === "move") {
          logEvent(`${COLOR_NAMES[action.prevColor]} a jou\xE9`, action.prevColor);
        }
      }
      if (action.type === "win") {
        play("victory");
        vibrate([100, 50, 100, 50, 300]);
        const nameMap = {};
        state.players.forEach((c) => {
          nameMap[c] = onlinePlayerName(c);
        });
        showWinner(action.winner, {}, nameMap);
        return;
      }
    }
    if (state.currentColor === myColor && state.phase === "rolling") {
      setDiceEnabled(true);
      const summary = getTurnSummary(state);
      announce(`Votre tour ! ${summary}. Lancez le d\xE9.`);
      setTimeout(() => $2("btn-dice").focus(), 50);
    }
  }
  function showOnlineError(id, msg) {
    const el2 = $2(id);
    if (!el2) return;
    el2.textContent = msg;
    el2.hidden = false;
  }
  function hideOnlineError(id) {
    const el2 = $2(id);
    if (el2) el2.hidden = true;
  }
  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
  var publicRoomsUnsub = null;
  function initOnlineScreens() {
    const onlineBtn = $2("btn-online");
    if (!onlineBtn) return;
    onlineBtn.addEventListener("click", () => {
      if (!isFirebaseAvailable()) {
        announce("Mode en ligne indisponible hors connexion.", true);
        return;
      }
      $2("online-name").value = getSavedName();
      hideOnlineError("online-error");
      showScreen("online-menu");
    });
    $2("btn-online-back").addEventListener("click", () => showScreen("setup"));
    $2("btn-create-room").addEventListener("click", () => {
      const name = $2("online-name").value.trim();
      if (!name) {
        showOnlineError("online-error", "Entrez un pseudo.");
        return;
      }
      onlineName = name;
      hideOnlineError("create-error");
      showScreen("online-create");
    });
    $2("btn-join-room").addEventListener("click", () => {
      const name = $2("online-name").value.trim();
      if (!name) {
        showOnlineError("online-error", "Entrez un pseudo.");
        return;
      }
      onlineName = name;
      hideOnlineError("join-error");
      showScreen("online-join");
      startPublicRoomsListener();
    });
    $2("btn-create-cancel").addEventListener("click", () => showScreen("online-menu"));
    $2("btn-create-confirm").addEventListener("click", onCreateRoom);
    $2("btn-join-back").addEventListener("click", () => {
      stopPublicRoomsListener();
      showScreen("online-menu");
    });
    $2("btn-join-code").addEventListener("click", onJoinByCode);
    $2("join-code").addEventListener("keydown", (e) => {
      if (e.key === "Enter") onJoinByCode();
    });
    $2("btn-lobby-leave").addEventListener("click", onLeaveLobby);
    $2("btn-lobby-start").addEventListener("click", onStartOnlineGame);
    ["online-max-players", "online-visibility", "online-win-mode"].forEach((id) => {
      const sel = $2(id);
      if (sel) sel.addEventListener("change", () => sel.focus());
    });
  }
  function startPublicRoomsListener() {
    stopPublicRoomsListener();
    publicRoomsUnsub = listenPublicRooms((rooms) => {
      const list = $2("public-rooms-list");
      if (rooms.length === 0) {
        list.innerHTML = '<p class="public-rooms-empty">Aucun plateau disponible.</p>';
        return;
      }
      list.innerHTML = "";
      for (const room of rooms) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "public-room-item";
        item.setAttribute("role", "listitem");
        item.innerHTML = `<span class="public-room-host">${esc(room.hostName)}</span><span class="public-room-info">${room.playerCount}/${room.maxPlayers}</span>`;
        item.addEventListener("click", () => onJoinPublicRoom(room.id));
        list.appendChild(item);
      }
    });
  }
  function stopPublicRoomsListener() {
    if (publicRoomsUnsub) {
      publicRoomsUnsub();
      publicRoomsUnsub = null;
    }
  }
  async function onCreateRoom() {
    const btn = $2("btn-create-confirm");
    btn.disabled = true;
    hideOnlineError("create-error");
    try {
      const result = await createRoom({
        playerName: onlineName,
        maxPlayers: parseInt($2("online-max-players").value, 10),
        isPublic: $2("online-visibility").value === "public",
        winMode: $2("online-win-mode").value
      });
      enterLobby(result.roomId, result.code, "red");
    } catch (err) {
      showOnlineError("create-error", err.message || "Erreur de cr\xE9ation.");
    } finally {
      btn.disabled = false;
    }
  }
  async function onJoinByCode() {
    const code = $2("join-code").value.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showOnlineError("join-error", "Entrez un code \xE0 6 chiffres.");
      return;
    }
    hideOnlineError("join-error");
    try {
      const result = await joinRoomByCode(code, onlineName);
      stopPublicRoomsListener();
      enterLobby(result.roomId, null, result.color);
    } catch (err) {
      showOnlineError("join-error", err.message || "Impossible de rejoindre.");
    }
  }
  async function onJoinPublicRoom(roomId) {
    hideOnlineError("join-error");
    try {
      const result = await joinRoom(roomId, onlineName);
      stopPublicRoomsListener();
      enterLobby(result.roomId, null, result.color);
    } catch (err) {
      showOnlineError("join-error", err.message || "Impossible de rejoindre.");
    }
  }
  var COLOR_PAL = { red: "#c62828", green: "#2e7d32", yellow: "#f57f17", blue: "#1565c0" };
  function enterLobby(roomId, code, color) {
    myColor = color;
    if (code) {
      $2("lobby-code").hidden = false;
      $2("lobby-code-value").textContent = code;
    } else {
      $2("lobby-code").hidden = true;
    }
    $2("btn-lobby-start").hidden = !isHost();
    $2("btn-lobby-start").disabled = true;
    showScreen("online-lobby");
    roomUnsub = listenRoom(roomId, {
      onPlayers: (players) => {
        onlinePlayersMap = players;
        renderLobbyPlayers(players);
        const count = Object.keys(players).length;
        if (isHost()) {
          $2("btn-lobby-start").disabled = count < 2;
          $2("lobby-status").textContent = count < 2 ? "En attente d'un autre joueur\u2026" : `${count} joueurs connect\xE9s. Pr\xEAt !`;
        } else {
          $2("lobby-status").textContent = `${count} joueurs connect\xE9s. En attente du lancement\u2026`;
        }
      },
      onStatus: (status) => {
        if (status === null) {
          announce("Le plateau a \xE9t\xE9 supprim\xE9.", true);
          resetOnline();
          showScreen("setup");
        }
      },
      onGameState: (gs) => {
        if (!gs) return;
        if (!state) {
          initOnlineGameFromState(gs);
        } else {
          onRemoteGameState(gs);
        }
      }
    });
  }
  function renderLobbyPlayers(players) {
    const container = $2("lobby-players");
    container.innerHTML = "";
    const uid = getUid();
    for (const [pid, p] of Object.entries(players)) {
      const div = document.createElement("div");
      div.className = "lobby-player";
      div.setAttribute("role", "listitem");
      const dot = document.createElement("span");
      dot.className = "lobby-player-dot";
      dot.style.background = COLOR_PAL[p.color] || "#888";
      div.appendChild(dot);
      const name = document.createElement("span");
      name.className = "lobby-player-name";
      name.textContent = `${p.name} \u2014 ${COLOR_NAMES[p.color]}`;
      div.appendChild(name);
      if (pid === uid) {
        const tag = document.createElement("span");
        tag.className = "lobby-player-tag you";
        tag.textContent = "Vous";
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
    aiPlayers = /* @__PURE__ */ new Set();
    aiNames = {};
    aiDifficulty = "normal";
    onlineSeq = -1;
    lastOnlineAction = null;
    const winMode = $2("online-win-mode")?.value || "all";
    state = createGame(playerCount, winMode);
    state.players.forEach((color) => {
      if (!(color in sessionScores)) sessionScores[color] = 0;
    });
    initHorses(state.horses);
    clearEventLog();
    showScreen("game");
    play("exit-stable");
    await setRoomStatus("playing");
    beginTurn();
  }
  function initOnlineGameFromState(gs) {
    unlockAudio();
    requestMotionPermission();
    isOnline = true;
    turnCount = 0;
    gameStartTime = Date.now();
    aiPlayers = /* @__PURE__ */ new Set();
    aiNames = {};
    aiDifficulty = "normal";
    onlineSeq = gs.seq || 0;
    lastOnlineAction = null;
    state = {
      players: gs.players,
      horses: gs.horses.map((h) => ({ color: h.color, id: h.id, relPos: h.relPos })),
      currentColor: gs.currentColor,
      phase: gs.phase,
      lastDice: gs.lastDice,
      consecutiveSixes: gs.consecutiveSixes || 0,
      validMoveIds: gs.validMoveIds || [],
      winMode: gs.winMode
    };
    initHorses(state.horses);
    clearEventLog();
    showScreen("game");
    play("exit-stable");
    updateTurnBanner(state.currentColor, state.phase, null);
    if (state.currentColor === myColor && state.phase === "rolling") {
      setDiceEnabled(true);
      announce("La partie commence ! Votre tour, lancez le d\xE9.");
      setTimeout(() => $2("btn-dice").focus(), 50);
    } else {
      setDiceEnabled(false);
      announce(`La partie commence ! Tour de ${onlinePlayerName(state.currentColor)}.`);
    }
  }
  async function onLeaveLobby() {
    if (roomUnsub) {
      roomUnsub();
      roomUnsub = null;
    }
    await leaveRoom();
    resetOnline();
    showScreen("online-menu");
  }
  function resetOnline() {
    isOnline = false;
    myColor = null;
    onlineSeq = -1;
    onlinePlayersMap = {};
    lastOnlineAction = null;
    state = null;
    if (roomUnsub) {
      roomUnsub();
      roomUnsub = null;
    }
    cleanupAll();
  }
})();
