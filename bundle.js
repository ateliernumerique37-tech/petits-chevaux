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
  function createGame(playerCount) {
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
      state2.phase = "game-over";
      state2.winner = currentColor;
      events.push({ type: "win", color: currentColor });
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

  // js/board.js
  var NS = "http://www.w3.org/2000/svg";
  var CS = 40;
  var W = 15 * CS;
  var PALETTE = {
    red: { main: "#c62828", light: "#ef9a9a", stable: "#ffcdd2", dark: "#7f0000", text: "#b71c1c" },
    green: { main: "#2e7d32", light: "#a5d6a7", stable: "#c8e6c9", dark: "#1b5e20", text: "#1b5e20" },
    yellow: { main: "#f57f17", light: "#fff176", stable: "#fffde7", dark: "#bc5100", text: "#e65100" },
    blue: { main: "#1565c0", light: "#90caf9", stable: "#bbdefb", dark: "#003c8f", text: "#0d47a1" }
  };
  var SHAPES = { red: "circle", green: "square", yellow: "triangle", blue: "diamond" };
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
    drawBase();
    drawStables();
    drawCross();
    drawTrackCells();
    drawHomeColumns();
    drawCenter();
    const staticLayer = el("g", { "aria-hidden": "true" });
    while (svg.firstChild) staticLayer.appendChild(svg.firstChild);
    svg.appendChild(staticLayer);
    horsesLayer = el("g", { id: "horses-layer" });
    svg.appendChild(horsesLayer);
    container.appendChild(svg);
    return svg;
  }
  function drawBase() {
    svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: W, fill: "#eceff1", rx: 4 }));
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
      svg.appendChild(el("rect", {
        x: c * CS + 3,
        y: r * CS + 3,
        width: 6 * CS - 6,
        height: 6 * CS - 6,
        rx: 10,
        fill: pal.stable,
        stroke: pal.main,
        "stroke-width": 2.5
      }));
      svg.appendChild(el("text", {
        x: c * CS + 3 * CS,
        y: r * CS + 5 * CS - 6,
        "text-anchor": "middle",
        fill: pal.dark,
        "font-size": 13,
        "font-weight": "bold",
        "font-family": "sans-serif",
        "aria-hidden": "true"
      }, COLOR_NAMES[color].toUpperCase()));
      for (const [sr, sc] of STABLE_POSITIONS[color]) {
        svg.appendChild(el("circle", {
          cx: px(sc),
          cy: py(sr),
          r: 15,
          fill: "white",
          stroke: pal.main,
          "stroke-width": 1.5,
          opacity: 0.6,
          "aria-hidden": "true"
        }));
      }
    }
  }
  function drawCross() {
    svg.appendChild(el("rect", { x: 0, y: 6 * CS, width: W, height: 3 * CS, fill: "white" }));
    svg.appendChild(el("rect", { x: 6 * CS, y: 0, width: 3 * CS, height: W, fill: "white" }));
  }
  function drawTrackCells() {
    for (let i = 0; i < TRACK.length; i++) {
      const [row, col] = TRACK[i];
      const safe = SAFE_ABS.has(i);
      svg.appendChild(el("rect", {
        x: col * CS + 1,
        y: row * CS + 1,
        width: CS - 2,
        height: CS - 2,
        rx: 3,
        fill: safe ? "#fff8e1" : "white",
        stroke: "#bdbdbd",
        "stroke-width": 1
      }));
      if (safe) drawStar(px(col), py(row), 10, 5);
    }
  }
  function drawStar(x, y, outerR, innerR) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push(`${x + Math.cos(a) * r},${y + Math.sin(a) * r}`);
    }
    svg.appendChild(el("polygon", {
      points: pts.join(" "),
      fill: "#ffd54f",
      stroke: "#ff8f00",
      "stroke-width": 0.5,
      "aria-hidden": "true"
    }));
  }
  function drawHomeColumns() {
    for (const color of COLOR_ORDER) {
      const pal = PALETTE[color];
      for (const [row, col] of HOME[color]) {
        svg.appendChild(el("rect", {
          x: col * CS + 1,
          y: row * CS + 1,
          width: CS - 2,
          height: CS - 2,
          rx: 3,
          fill: pal.light,
          stroke: pal.main,
          "stroke-width": 1.5
        }));
      }
    }
  }
  function drawCenter() {
    for (const [row, col] of [[6, 6], [6, 8], [8, 6], [8, 8]]) {
      svg.appendChild(el("rect", {
        x: col * CS,
        y: row * CS,
        width: CS,
        height: CS,
        fill: "#e0e0e0"
      }));
    }
    const cx7 = 7 * CS, cy7 = 7 * CS;
    const mid = CS / 2;
    const triangles = [
      { color: "red", pts: `${cx7},${cy7 + mid} ${cx7 + mid},${cy7} ${cx7},${cy7}` },
      // top-left
      { color: "green", pts: `${cx7 + mid},${cy7} ${cx7 + CS},${cy7} ${cx7 + mid},${cy7 + mid}` },
      // top-right
      { color: "yellow", pts: `${cx7 + CS},${cy7 + mid} ${cx7 + mid},${cy7 + mid} ${cx7 + CS},${cy7 + CS}` },
      // bottom-right
      { color: "blue", pts: `${cx7 + mid},${cy7 + mid} ${cx7},${cy7 + CS} ${cx7 + CS},${cy7 + CS}` }
      // bottom
    ];
    for (const { color, pts } of triangles) {
      svg.appendChild(el("polygon", {
        points: pts,
        fill: PALETTE[color].main,
        opacity: 0.85,
        "aria-hidden": "true"
      }));
    }
    const starPts = [];
    const cx = cx7 + mid, cy = cy7 + mid;
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? 12 : 5;
      starPts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    svg.appendChild(el("polygon", {
      points: starPts.join(" "),
      fill: "white",
      opacity: 0.9,
      "aria-hidden": "true"
    }));
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
    addShape(g, horse.color, 0, 0);
    return g;
  }
  function addShape(g, color, x, y) {
    const pal = PALETTE[color];
    const shape = SHAPES[color];
    g.appendChild(el("circle", { cx: x, cy: y, r: 22, fill: "none", "pointer-events": "all" }));
    if (shape === "circle") {
      g.appendChild(el("circle", { cx: x, cy: y, r: 14, fill: pal.main, stroke: "white", "stroke-width": 2.5 }));
      g.appendChild(el("circle", { cx: x - 4, cy: y - 4, r: 5, fill: "white", opacity: 0.4 }));
    } else if (shape === "square") {
      g.appendChild(el("rect", { x: x - 13, y: y - 13, width: 26, height: 26, rx: 4, fill: pal.main, stroke: "white", "stroke-width": 2.5 }));
      g.appendChild(el("rect", { x: x - 8, y: y - 8, width: 8, height: 8, rx: 2, fill: "white", opacity: 0.4 }));
    } else if (shape === "triangle") {
      g.appendChild(el("polygon", { points: `${x},${y - 15} ${x + 14},${y + 9} ${x - 14},${y + 9}`, fill: pal.main, stroke: "white", "stroke-width": 2.5 }));
      g.appendChild(el("circle", { cx: x, cy: y, r: 4, fill: "white", opacity: 0.4 }));
    } else {
      g.appendChild(el("polygon", { points: `${x},${y - 16} ${x + 16},${y} ${x},${y + 16} ${x - 16},${y}`, fill: pal.main, stroke: "white", "stroke-width": 2.5 }));
      g.appendChild(el("circle", { cx: x, cy: y, r: 5, fill: "white", opacity: 0.4 }));
    }
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

  // js/sound.js
  var pool = {};
  var unlocked = false;
  var SOUND_NAMES = [
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
    for (const name of SOUND_NAMES) {
      const audio = new Audio(`sounds/${name}.mp3`);
      audio.preload = "auto";
      pool[name] = audio;
    }
  }
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    for (const audio of Object.values(pool)) {
      audio.play().then(() => audio.pause()).catch(() => {
      });
    }
  }
  function play(name) {
    const src = pool[name];
    if (!src) return;
    const clone = src.cloneNode();
    clone.volume = 0.75;
    clone.play().catch(() => {
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
      onStart(count);
    });
  }
  var passResolve = null;
  function showPassPhone(color, onShown) {
    return new Promise((resolve) => {
      passResolve = resolve;
      const pal = {
        red: "#c62828",
        green: "#2e7d32",
        yellow: "#f57f17",
        blue: "#1565c0"
      };
      const screen = $("screen-pass");
      screen.style.setProperty("--pass-color", pal[color]);
      $("pass-player-name").textContent = COLOR_NAMES[color];
      $("pass-player-name").style.color = pal[color];
      showScreen("pass");
      if (onShown) onShown();
      announce(`Passez le t\xE9l\xE9phone au joueur ${COLOR_NAMES[color]}`, true);
    });
  }
  function initPassScreen() {
    $("btn-ready").addEventListener("click", () => {
      if (passResolve) {
        passResolve();
        passResolve = null;
      }
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
  function showWinner(color) {
    $("winner-name").textContent = COLOR_NAMES[color];
    $("winner-name").style.color = {
      red: "#c62828",
      green: "#2e7d32",
      yellow: "#f57f17",
      blue: "#1565c0"
    }[color];
    showScreen("winner");
    announce(`Victoire ! ${COLOR_NAMES[color]} a gagn\xE9 la partie !`, true);
  }
  function initWinnerScreen(onRestart) {
    $("btn-restart").addEventListener("click", onRestart);
  }
  function announce(message, urgent = false) {
    const region = $(urgent ? "aria-alert" : "aria-status");
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }
  var DICE_FACES = ["\u2680", "\u2681", "\u2682", "\u2683", "\u2684", "\u2685"];

  // js/main.js
  var state = null;
  window.addEventListener("DOMContentLoaded", () => {
    loadSounds();
    createBoard(document.getElementById("board-container"));
    initSetupScreen(startGame);
    initPassScreen();
    initDiceButton(onDiceClick);
    initWinnerScreen(() => showScreen("setup"));
    showScreen("setup");
  });
  async function startGame(playerCount) {
    unlockAudio();
    state = createGame(playerCount);
    initHorses(state.horses);
    await showPassPhone(state.currentColor, () => play("pass-phone"));
    showScreen("game");
    beginTurn();
  }
  function beginTurn() {
    state.phase = "rolling";
    state.lastDice = null;
    state.validMoveIds = [];
    updateTurnBanner(state.currentColor, state.phase, null);
    setDiceEnabled(true);
    announce(`Tour de ${COLOR_NAMES[state.currentColor]}. Lancez le d\xE9.`);
  }
  function onDiceClick() {
    if (state.phase !== "rolling") return;
    unlockAudio();
    setDiceEnabled(false);
    play("dice-roll");
    const value = rollDice();
    state.lastDice = value;
    animateDice(value, () => {
      if (value === 6) {
        state.consecutiveSixes++;
      } else {
        state.consecutiveSixes = 0;
      }
      if (state.consecutiveSixes >= 3) {
        state.consecutiveSixes = 0;
        play("pass-turn");
        updateTurnBanner(state.currentColor, state.phase, value);
        const penalized = applyTripleSixPenalty(state);
        if (penalized) {
          moveHorse(penalized);
          announce(
            `Trois 6 de suite ! Cheval ${COLOR_NAMES[state.currentColor]} ${penalized.id + 1} retourne \xE0 l'\xE9curie. Tour perdu.`,
            true
          );
        } else {
          announce(`Trois 6 de suite ! Tour perdu.`, true);
        }
        setTimeout(() => endTurn(false), 2e3);
        return;
      }
      if (value === 6) play("dice-six");
      const ids = getValidMoves(state, value);
      state.validMoveIds = ids;
      const colorName = COLOR_NAMES[state.currentColor];
      updateTurnBanner(state.currentColor, state.phase, value);
      if (ids.length === 0) {
        announce(`${colorName} lance ${value}. Aucun mouvement possible.`, true);
        play("pass-turn");
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
    for (const ev of events) {
      if (ev.type === "exit-stable" || ev.type === "move") {
        const horse = state.horses.find((h) => h.color === ev.color && h.id === ev.horseId);
        moveHorse(horse);
        if (ev.bounced) {
          play("move");
          announce(
            `Rebond ! Cheval ${COLOR_NAMES[ev.color]} ${ev.horseId + 1} recule \xE0 la case ${horse.relPos - 51} du couloir.`
          );
        } else {
          play(ev.type);
        }
      }
      if (ev.type === "capture") {
        hadCapture = true;
        const captured = state.horses.find((h) => h.color === ev.capturedColor && h.id === ev.capturedId);
        moveHorse(captured);
        play("capture");
        announce(
          `Capture ! Cheval ${COLOR_NAMES[ev.capturedColor]} renvoy\xE9 \xE0 l'\xE9curie. Vous rejouez !`,
          true
        );
      }
      if (ev.type === "home-stretch") {
        play("home-stretch");
        announce(`${COLOR_NAMES[ev.color]} entre dans le couloir d'arriv\xE9e !`);
      }
      if (ev.type === "win") {
        setTimeout(() => {
          play("victory");
          showWinner(ev.color);
        }, 600);
        return;
      }
    }
    const extraTurn = dice === 6 || hadCapture;
    setTimeout(() => endTurn(extraTurn), 600);
  }
  async function endTurn(extraTurn) {
    if (extraTurn) {
      announce(`${COLOR_NAMES[state.currentColor]} rejoue !`);
      beginTurn();
      return;
    }
    advanceTurn(state);
    await showPassPhone(state.currentColor, () => play("pass-phone"));
    showScreen("game");
    beginTurn();
  }
})();
