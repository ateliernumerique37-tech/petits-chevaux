# Petits Chevaux — Documentation projet pour Claude

## Vue d'ensemble

PWA de jeu de Petits Chevaux (Ludo français) jouable sur mobile et PC.
Conçue en priorité pour les **utilisateurs malvoyants** (association H2VL — Handicap Visuel Val de Loire) :
l'accessibilité au lecteur d'écran est la contrainte n°1, non négociable.

- **Technologie** : HTML/CSS/JS vanille, aucun framework
- **Modules** : ES Modules dans `js/`, bundlés avec esbuild → `bundle.js`
- **Mode de jeu** : pass-and-play local (2–4 joueurs) ou solo contre l'IA Bernard
- **Déploiement** : GitHub Pages (branche `master`), auto-deploy à chaque push
- **URL de production** : `https://ateliernumerique37-tech.github.io/petits-chevaux/`

---

## Structure des fichiers

```
petits-chevaux/
├── index.html          # Écran de configuration + écran de jeu + écran victoire
├── regles.html         # Page des règles du jeu (accessible, hors SPA)
├── style.css           # Feuille de style unique (dark mode, high contrast, reduced motion)
├── manifest.json       # PWA manifest (icône SVG inline)
├── service-worker.js   # Cache offline (strategy: cache-first), auto-update via skipWaiting
├── bundle.js           # Artefact de build (NE PAS éditer directement)
├── sounds/             # Fichiers MP3 (8 sons)
│   ├── dice-roll.mp3
│   ├── dice-six.mp3
│   ├── move.mp3
│   ├── exit-stable.mp3
│   ├── capture.mp3
│   ├── home-stretch.mp3
│   ├── victory.mp3
│   ├── pass-turn.mp3
│   └── pass-phone.mp3  # Gardé dans les assets (son encore présent)
└── js/                 # Sources ES Modules (non committées sauf main.js)
    ├── main.js         # Orchestrateur — initialisation, gestion des tours, clavier
    ├── game.js         # Logique pure du jeu (pas de DOM)
    ├── ui.js           # Couche UI : écrans, annonces ARIA, boutons
    ├── board.js        # Rendu SVG du plateau + gestion des pièces
    └── sound.js        # Chargement et lecture des sons
```

> **Règle Git** : seuls `bundle.js` et `js/main.js` sont commités. Les autres fichiers `js/` sont
> dans `.gitignore` (ils sont bundlés dans `bundle.js`). Si on doit vérifier qu'un fichier source
> est bien exclu, vérifier `.gitignore`.

---

## Build

```bash
cd Projets/petits-chevaux
npx esbuild js/main.js --bundle --outfile=bundle.js --format=iife --platform=browser
```

À faire **après chaque modification** d'un fichier `js/`. Aucun watch mode, aucune étape de test.
Le build produit environ 34–36 kb (IIFE, non minifié).

### Bump de cache service worker

À chaque déploiement qui modifie des fichiers statiques (HTML, CSS, JS, sons), incrémenter
la constante `CACHE` dans `service-worker.js` :

```js
const CACHE = 'petits-chevaux-vN'; // incrémenter N
```

Cela déclenche `skipWaiting()` à l'install, puis `controllerchange` côté client → `window.location.reload()`.

---

## Architecture JS

### `js/game.js` — Logique pure (zéro DOM)

Contient tout l'état et les règles du jeu. Toutes les fonctions sont pures ou quasi-pures.

**Constantes clés :**
- `TRACK` : tableau de 52 coordonnées `[row, col]` du circuit commun (sens antihoraire dans le tableau, mais sens horaire visuellement)
- `START` : index absolu sur `TRACK` où chaque couleur démarre `{ red:0, green:13, yellow:26, blue:39 }`
- `HOME` : coordonnées des 6 cases du couloir d'arrivée par couleur
- `STABLE_POSITIONS` : coordonnées des 4 cases d'écurie par couleur
- `SAFE_ABS` : `Set` des 4 index absolus protégés (cases de départ = `{0,13,26,39}`)
- `FINISHED_REL` : `58` — position relative finale (centre)

**Positions relatives (`relPos`) d'un cheval :**
- `-1` : en écurie
- `0–51` : sur le circuit commun
- `52–57` : dans le couloir d'arrivée (case 1 à 6)
- `58` : au centre (terminé)

**Fonctions exportées :**

| Fonction | Rôle |
|---|---|
| `createGame(playerCount)` | Crée l'état initial |
| `rollDice()` | Retourne 1–6 |
| `getValidMoves(state, dice)` | Retourne les `id` des chevaux déplaçables |
| `applyMove(state, horseId, dice)` | Applique le mouvement, retourne un tableau d'événements |
| `applyTripleSixPenalty(state)` | Renvoie le cheval le plus avancé à l'écurie |
| `advanceTurn(state)` | Passe au joueur suivant |
| `getMoveLabel(state, horse, dice)` | Description ARIA du mouvement pour le lecteur d'écran |
| `getHorseDescription(horse)` | Description ARIA de la position courante |
| `getTurnSummary(state)` | Résumé des positions du joueur actif (annoncé en début de tour) |
| `getFullSituation(state)` | Positions de tous les joueurs (bouton Situation) |
| `getAIMove(state, dice)` | Décision stratégique de Bernard |

**Événements retournés par `applyMove` :**
```js
{ type: 'exit-stable' | 'move', bounced, color, horseId }
{ type: 'home-stretch', color, horseId }
{ type: 'capture', capturedColor, capturedId, byColor }
{ type: 'win', color }
```

**Bernard — stratégie `getAIMove` (6 priorités dans l'ordre) :**
1. Gagner immédiatement (atteindre `relPos === 58`)
2. Capturer un adversaire
3. Avancer un cheval déjà dans le couloir (le plus proche du centre)
4. Entrer dans le couloir d'arrivée
5. Sur le circuit : case protégée > case non dangereuse > case la plus avancée
6. Sortir un cheval de l'écurie (fallback)

`isExposed(absPos)` détecte si une case est à portée d'un adversaire (1–6 cases derrière).

---

### `js/ui.js` — Couche UI et accessibilité

**Gestion des écrans :**
```js
showScreen(name) // 'setup' | 'game' | 'winner'
```
Cache tous les `.screen` (hidden + aria-hidden), affiche le cible, met le focus sur le premier
élément focusable.

**Système d'annonces ARIA — dual live regions :**

Problème résolu : un lecteur d'écran ignore un `aria-live` dont le contenu est identique au précédent.
Solution : deux régions `polite` alternées. Chaque appel écrit dans l'autre région → le DOM change toujours.

```js
// index.html
<div id="aria-status-a" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
<div id="aria-status-b" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
<div id="aria-alert"    role="alert"  aria-live="assertive" aria-atomic="true" class="sr-only"></div>
```

```js
// ui.js — fonctionnement
let politeToggle = false;
export function announce(message, urgent = false) {
  lastAnnouncement = message;
  if (urgent) {
    // aria-alert : assertive, interrompt le lecteur
    $('aria-alert').textContent = '';
    requestAnimationFrame(() => { $('aria-alert').textContent = message; });
  } else {
    politeToggle = !politeToggle;
    const activeId   = politeToggle ? 'aria-status-a' : 'aria-status-b';
    const inactiveId = politeToggle ? 'aria-status-b' : 'aria-status-a';
    $(inactiveId).textContent = '';           // vider l'inactif
    $(activeId).textContent = '';             // vider l'actif (garanti DOM change)
    requestAnimationFrame(() => { $(activeId).textContent = message; });
  }
}
```

`repeatLastAnnouncement()` appelle simplement `announce(lastAnnouncement)`, ce qui toggle vers
l'autre région → le lecteur relit même un message identique.

**Fonctions exportées clés :**
- `initSetupScreen(onStart)` — lit `player-count` et `ai-mode`, appelle le callback
- `initDiceButton(onClick)`, `initRepeatButton(onClick)`, `initSituationButton(onClick)`
- `updateTurnBanner(color, phase, diceValue)` — met à jour le bandeau coloré
- `setDiceEnabled(bool)` — active/désactive le bouton dé
- `animateDice(finalValue, callback)` — animation de 8 ticks à 80ms
- `showWinner(color, scores, nameMap)` — affiche l'écran de victoire avec les scores de session
- `initWinnerScreen(onRestart)`

---

### `js/board.js` — Plateau SVG

Génère un SVG 15×15 grilles dans `#board-container`. Les chevaux sont des cercles SVG
positionnés via `getCellCoords(horse)` de `game.js`.

**Fonctions exportées :**
- `createBoard(container)` — génère le SVG, les cellules et les zones de stables
- `initHorses(horses)` — crée les éléments SVG pour chaque cheval
- `moveHorse(horse)` — repositionne un cheval avec animation CSS (`transition: transform 0.35s`)
- `setMovable(color, ids, onClick)` — ajoute classe `can-move`, `tabindex="0"`, handlers
- `clearHighlights()` — retire tous les états de sélection
- `updateHorseLabel(color, id, label)` — met à jour `aria-label` pendant la phase de sélection

---

### `js/sound.js` — Sons

```js
loadSounds()          // précharge tous les MP3 via Audio()
unlockAudio()         // débloque l'audio sur iOS (doit être appelé depuis un geste utilisateur)
play(name)            // joue un son par nom
```

Sons disponibles : `dice-roll`, `dice-six`, `move`, `exit-stable`, `capture`,
`home-stretch`, `victory`, `pass-turn`, `pass-phone`.

---

### `js/main.js` — Orchestrateur

Point d'entrée du bundle. Gère le cycle de vie d'une partie.

**État global :**
```js
let state = null;          // objet de jeu (voir createGame)
let aiPlayers = new Set(); // couleurs contrôlées par Bernard
const sessionScores = {};  // { color: nbVictoires } — persiste entre parties
let shortcutsAnnounced = false; // n'annonce les raccourcis qu'une seule fois par session
```

**Flux principal :**
```
startGame()
  → initHorses()
  → showScreen('game')
  → beginTurn()
      → [IA] setTimeout(aiPlayTurn, 1800)
      → [Humain] setDiceEnabled(true) + focus sur btn-dice

onDiceClick() / aiPlayTurn()
  → rollDice() → animateDice()
  → triple 6 ? → applyTripleSixPenalty() → endTurn(false)
  → getValidMoves()
  → 0 mouvement ? → endTurn(false)
  → [IA] setTimeout(getAIMove → onHorseSelected, 800)
  → [Humain] setMovable() ou auto-select si 1 seul cheval

onHorseSelected(id)
  → applyMove() → events → moveHorse() / capture / win
  → endTurn(extraTurn)

endTurn(extraTurn)
  → extraTurn ? beginTurn() directement
  → sinon advanceTurn() → beginTurn()
```

**Raccourcis clavier (`handleKeyboard`) :**

Préfixe : `Alt+Shift` (`e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey`).
Utilise `e.code` (position physique, indépendante du layout).

| `e.code` | Touche AZERTY | Action |
|---|---|---|
| `KeyD` | D | Lancer le dé (phase rolling, joueur humain) |
| `Digit1`–`Digit4` | 1–4 | Sélectionner le cheval n (phase selecting, joueur humain) |
| `KeyS` | S | Lire la situation (tous joueurs) |
| `KeyQ` | A | Répéter la dernière annonce |

> **Piège AZERTY** : sur un clavier français, la touche étiquetée "A" est à la position physique
> "Q" (QWERTY). `e.code === 'KeyQ'` pour la touche "A". Utiliser `KeyQ` dans le code, annoncer
> "A" à l'utilisateur. Les touches D, S et les chiffres sont identiques sur AZERTY et QWERTY.

**`playerLabel(color)`** : retourne `"Bernard (Vert)"` pour les couleurs IA, `"Vert"` pour les humains.

---

## Accessibilité — règles à ne pas casser

1. **Ne jamais annoncer deux fois le même texte via la même région ARIA** — toujours passer par
   `announce()` qui alterne automatiquement entre `aria-status-a` et `aria-status-b`.

2. **`urgent = true`** pour les événements qui interrompent (triple 6, capture, victoire).
   **`urgent = false`** (défaut) pour les messages informatifs de tour.

3. **Focus management** : après `showScreen('game')`, le focus est mis sur le premier élément
   focusable. En début de tour humain, `setTimeout(() => btn-dice.focus(), 50)` remet
   explicitement le focus sur le bouton dé. Les 50ms évitent la collision avec `requestAnimationFrame`.

4. **`aria-label` sur les chevaux** : mis à jour par `updateHorseLabel` pendant la sélection
   pour décrire ce qui se passera si on choisit ce cheval (via `getMoveLabel`).

5. **Pas d'écran de passation** : le passage de tour est direct. L'annonce `"Tour de Vert. ..."`
   suffit comme signal au lecteur d'écran.

---

## PWA et déploiement

### Service Worker

Stratégie **cache-first** : toujours servir depuis le cache, sinon réseau.
Liste des assets précachés dans `ASSETS` (dans `service-worker.js`).

**Auto-update :**
```js
// index.html
navigator.serviceWorker.register('service-worker.js').then(reg => {
  const prevController = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (prevController) window.location.reload();
  });
});
```
`skipWaiting()` dans l'événement `install` du SW → le nouveau SW prend le contrôle immédiatement
→ déclenche `controllerchange` → rechargement automatique de la page.

**À faire à chaque déploiement** : incrémenter `CACHE` dans `service-worker.js` pour
invalider l'ancienne version et forcer l'installation du nouveau SW.

### GitHub Pages

- Branche : `master`
- Déclencheur : push → deploy automatique en ~1 min
- Surveiller avec : `gh run list --repo ateliernumerique37-tech/petits-chevaux`

---

## CSS — points clés

- CSS custom properties dans `:root`, surchargées pour `prefers-color-scheme: dark` et
  `prefers-contrast: more`
- `@media (prefers-reduced-motion: reduce)` : toutes les animations désactivées
- `[hidden] { display: none !important; }` : garantit que `hidden` l'emporte sur `display:flex`
- `.sr-only` : masquage visuel conforme WCAG (clip + overflow hidden, pas `display:none`)
- `.game-footer` en colonne : bouton dé en haut, puis `.game-actions-row` (Situation + Répéter)
- `.btn-secondary` : boutons discrets pour les actions utilitaires (44px min-height pour touch)

---

## Règles du jeu — `regles.html`

Page autonome (pas de JS), styles partagés via `style.css` + surcharges locales inline.
Lien "← Retour au jeu" en haut et en bas, pointe vers `index.html`.
Lien depuis `index.html` : balise `<a class="btn-rules-link">` sous le bouton "Lancer la partie".
Cachée dans le service worker (dans `ASSETS`).

---

## Décisions de conception et pièges connus

| Sujet | Décision | Raison |
|---|---|---|
| ARIA live dual-region | Deux `<div role="status">` alternées | Lecteur d'écran ignore les régions dont le contenu n'a pas changé |
| `e.code` vs `e.key` | `e.code` pour tous les raccourcis | Indépendant de la disposition clavier — sauf le piège AZERTY (voir ci-dessus) |
| Pas d'écran "Je suis prêt" | Tour direct au joueur suivant | Simplifie le flux, pas nécessaire sur PC/avec lecteur d'écran |
| `skipWaiting()` immédiat | Oui, dès l'install | Garantit que la nouvelle version est chargée sans intervention utilisateur |
| IA synchrone | Délais `setTimeout` (1800ms + 800ms) | Donne l'impression que Bernard "réfléchit" |
| Scores de session | Objet en mémoire, perdu au rechargement | Suffisant pour une session de jeu, pas de persistence nécessaire |
| `pass-phone.mp3` | Gardé dans les assets sonores | Le son existe encore, même si l'écran de passation a été supprimé |

---

## Commandes utiles

```bash
# Rebuilder le bundle après modification d'un fichier js/
npx esbuild js/main.js --bundle --outfile=bundle.js --format=iife --platform=browser

# Committer et déployer
git add bundle.js js/main.js [autres fichiers modifiés]
git commit -m "description"
git push origin master

# Surveiller le déploiement
gh run list --repo ateliernumerique37-tech/petits-chevaux

# Vérifier un run spécifique
gh run view <RUN_ID> --repo ateliernumerique37-tech/petits-chevaux
```
