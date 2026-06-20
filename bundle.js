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
  function getAIMove(state2, dice) {
    const ids = getValidMoves(state2, dice);
    if (ids.length === 0) return null;
    if (ids.length === 1) return ids[0];
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
    svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: W, rx: 16, fill: "url(#grad-field)" }));
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
      "aria-pressed": "false",
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
        piece.setAttribute("aria-pressed", "true");
        onSelect(id);
      };
      piece._pickHandler = pick;
      piece.addEventListener("click", pick);
      piece.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      });
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
      piece.removeAttribute("aria-pressed");
      if (piece._pickHandler) {
        piece.removeEventListener("click", piece._pickHandler);
        delete piece._pickHandler;
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
  var fetched = /* @__PURE__ */ new Map();
  function loadSounds() {
    for (const name of SOUNDS) {
      fetched.set(
        name,
        fetch(`sounds/${name}.mp3`).then((r) => r.arrayBuffer()).catch(() => null)
      );
    }
  }
  function unlockAudio() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {
      });
      return;
    }
    try {
      ctx = new AudioContext();
    } catch (e) {
      return;
    }
    Promise.all(SOUNDS.map(async (name) => {
      try {
        const raw = await fetched.get(name);
        if (raw) buffers.set(name, await ctx.decodeAudioData(raw));
      } catch (e) {
      }
    }));
  }
  function play(name) {
    if (!ctx || !buffers.has(name)) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {
    });
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(name);
    const gain = ctx.createGain();
    gain.gain.value = 0.75;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
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
      onStart(count, aiMode, winMode);
    });
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
  var DICE_FACES = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];

  // js/main.js
  var state = null;
  var aiPlayers = /* @__PURE__ */ new Set();
  var sessionScores = {};
  var shortcutsAnnounced = false;
  var AI_NAME = "Bernard";
  function playerLabel(color) {
    return aiPlayers.has(color) ? `${AI_NAME} (${COLOR_NAMES[color]})` : COLOR_NAMES[color];
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
  function onDeviceMotion(e) {
    if (!state || state.phase !== "rolling" || aiPlayers.has(state.currentColor)) return;
    const btn = document.getElementById("btn-dice");
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
    if (typeof DeviceMotionEvent === "undefined") return;
    if (motionListenerAdded) return;
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
    createBoard(document.getElementById("board-container"));
    initSetupScreen(startGame);
    initDiceButton(onDiceClick);
    initWinnerScreen(() => showScreen("setup"));
    initRepeatButton(repeatLastAnnouncement);
    initSituationButton(() => {
      if (!state) return;
      announce(getFullSituation(state));
    });
    initQuitButton(() => {
      state = null;
      showScreen("setup");
    });
    document.addEventListener("keydown", handleKeyboard);
    showScreen("setup");
  });
  function handleKeyboard(e) {
    if (!e.altKey || !e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) return;
    switch (e.code) {
      case "KeyD":
        if (state && state.phase === "rolling" && !aiPlayers.has(state.currentColor)) {
          e.preventDefault();
          const btn = document.getElementById("btn-dice");
          if (!btn.disabled) onDiceClick();
        }
        break;
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
        if (state && state.phase === "selecting" && !aiPlayers.has(state.currentColor)) {
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
  function startGame(playerCount, isAiMode, winMode) {
    unlockAudio();
    requestMotionPermission();
    state = createGame(playerCount, winMode);
    aiPlayers = /* @__PURE__ */ new Set();
    if (isAiMode) {
      state.players.slice(1).forEach((color) => aiPlayers.add(color));
    }
    state.players.forEach((color) => {
      if (!(color in sessionScores)) sessionScores[color] = 0;
    });
    initHorses(state.horses);
    clearEventLog();
    showScreen("game");
    if (!shortcutsAnnounced) {
      shortcutsAnnounced = true;
      announce("Raccourcis Alt+Maj disponibles : D pour le d\xE9, 1 \xE0 4 pour un cheval, S pour la situation, A pour r\xE9p\xE9ter.", true);
    }
    beginTurn();
  }
  function beginTurn() {
    state.phase = "rolling";
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
      announce(`Tour de ${colorName}. ${summary}. Lancez le d\xE9.`);
      setTimeout(() => document.getElementById("btn-dice").focus(), 50);
    }
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
            `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne \xE0 l'\xE9curie. Tour de ${AI_NAME} perdu.`,
            true
          );
          logEvent(`${COLOR_NAMES[state.currentColor]} : trois 6 ! cheval ${penalized.id + 1} \u2192 \xE9curie`, state.currentColor);
        } else {
          announce(`Trois 6 de suite ! Tour de ${AI_NAME} perdu.`, true);
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
        const chosenId = getAIMove(state, value);
        onHorseSelected(chosenId);
      }, 800);
    });
  }
  function onDiceClick() {
    if (state.phase !== "rolling") return;
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
        setTimeout(() => endTurn(false), 1200);
        return;
      }
      state.phase = "selecting";
      if (ids.length === 1) {
        announce(`${colorName} lance ${value}. Un seul cheval peut bouger.`);
        const horse = state.horses.find((h) => h.color === state.currentColor && h.id === ids[0]);
        updateHorseLabel(state.currentColor, ids[0], getMoveLabel(state, horse, value));
        setTimeout(() => onHorseSelected(ids[0]), 300);
      } else {
        announce(`${colorName} lance ${value}. ${ids.length} chevaux peuvent bouger. Utilisez Tab pour naviguer, Entr\xE9e pour choisir.`);
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
    for (const ev of events) {
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
        const replayMsg = aiPlayers.has(ev.byColor) ? `${AI_NAME} rejoue !` : "Vous rejouez !";
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
        logEvent(`${COLOR_NAMES[ev.color]} gagne la partie !`, ev.color);
        const nameMap = {};
        state.players.forEach((c) => {
          nameMap[c] = playerLabel(c);
        });
        setTimeout(() => {
          play("victory");
          vibrate([100, 50, 100, 50, 300]);
          showWinner(ev.color, sessionScores, nameMap);
        }, 600);
        return;
      }
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
})();
