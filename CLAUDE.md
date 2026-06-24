# Petits Chevaux — Documentation projet pour Claude

## Vue d'ensemble

PWA de jeu de Petits Chevaux (Ludo français) jouable sur mobile et PC.
Conçue en priorité pour les **utilisateurs malvoyants** (association H2VL — Handicap Visuel Val de Loire) :
l'accessibilité au lecteur d'écran est la contrainte n°1, non négociable.

- **Technologie** : HTML/CSS/JS vanille, aucun framework
- **Modules** : ES Modules dans `js/`, bundlés avec esbuild → `bundle.js`
- **Mode de jeu** : pass-and-play local (2–4 joueurs), solo contre l'IA Bernard, ou **multijoueur en ligne**
- **Déploiement** : GitHub Pages (branche `master`), auto-deploy à chaque push
- **URL de production** : `https://ateliernumerique37-tech.github.io/petits-chevaux/`
- **Le repo doit rester public** — GitHub Pages gratuit ne fonctionne qu'avec les repos publics

---

## Structure des fichiers

```
petits-chevaux/
├── index.html          # Écran de configuration + jeu + victoire + écrans en ligne
├── regles.html         # Page des règles du jeu (accessible, hors SPA)
├── style.css           # Feuille de style unique (dark mode, high contrast, reduced motion)
├── manifest.json       # PWA manifest (icône SVG inline)
├── service-worker.js   # Cache offline (strategy: cache-first), auto-update via skipWaiting
├── bundle.js           # Artefact de build (NE PAS éditer directement)
├── firebase.json       # Config Firebase (pointe vers database.rules.json)
├── database.rules.json # Règles de sécurité Firebase Realtime Database
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
    ├── main.js         # Orchestrateur — initialisation, gestion des tours, clavier, online
    ├── online.js       # Module Firebase — auth anonyme, salons, sync temps réel
    ├── game.js         # Logique pure du jeu (pas de DOM)
    ├── ui.js           # Couche UI : écrans, annonces ARIA, boutons
    ├── board.js        # Rendu SVG du plateau + gestion des pièces
    └── sound.js        # Chargement et lecture des sons
```

> **Règle Git** : seuls `bundle.js`, `js/main.js`, `database.rules.json` et `firebase.json` sont commités.
> Les autres fichiers `js/` (dont `online.js`) sont dans `.gitignore` (bundlés dans `bundle.js`).

---

## Build

```bash
cd Projets/petits-chevaux
npx esbuild js/main.js --bundle --outfile=bundle.js --format=iife --platform=browser
```

À faire **après chaque modification** d'un fichier `js/`. Aucun watch mode, aucune étape de test.
Le build produit environ **74 kb** (IIFE, non minifié) depuis l'ajout du module online.

### Bump de cache service worker

À chaque déploiement qui modifie des fichiers statiques (HTML, CSS, JS, sons), incrémenter
la constante `CACHE` dans `service-worker.js` :

```js
const CACHE = 'petits-chevaux-vN'; // version actuelle : v17
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
| `createGame(playerCount, winMode)` | Crée l'état initial. `winMode` : `'all'` (4 chevaux, défaut/officiel) ou `'one'` (1 cheval, partie rapide) |
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

**Condition de victoire (`winMode`, choisie à l'écran de config)** :
- `'all'` (défaut, **règle officielle**) : victoire quand **les 4 chevaux** sont au centre.
- `'one'` (**partie rapide**) : victoire dès qu'**un** cheval atteint le centre.

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

---

### `js/ui.js` — Couche UI et accessibilité

**Gestion des écrans :**
```js
showScreen(name) // 'setup' | 'game' | 'winner' | 'online-menu' | 'online-create' | 'online-join' | 'online-lobby' | 'stats'
```

**Système d'annonces ARIA — dual live regions :**

Problème résolu : un lecteur d'écran ignore un `aria-live` dont le contenu est identique au précédent.
Solution : deux régions `polite` alternées. Chaque appel écrit dans l'autre région → le DOM change toujours.

```js
// index.html
<div id="aria-status-a" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
<div id="aria-status-b" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
<div id="aria-alert"    role="alert"  aria-live="assertive" aria-atomic="true" class="sr-only"></div>
```

`repeatLastAnnouncement()` appelle `announce(lastAnnouncement)` → toggle vers l'autre région → le lecteur relit même un message identique.

**Fonctions exportées clés :**
- `initSetupScreen(onStart)` — lit `player-count` et `ai-mode`, appelle le callback
- `initDiceButton(onClick)`, `initRepeatButton(onClick)`, `initSituationButton(onClick)`
- `updateTurnBanner(color, phase, diceValue)` — met à jour le bandeau coloré
- `setDiceEnabled(bool)` — active/désactive le bouton dé
- `animateDice(finalValue, callback)` — animation de 8 ticks à 80ms
- `showWinner(color, scores, nameMap)` — affiche l'écran de victoire avec les scores de session
- `logEvent(text, color, capture)` / `clearEventLog()` — journal visuel des coups (aria-hidden)

---

### `js/board.js` — Plateau SVG

Génère un SVG 15×15 (viewBox 600×600) dans `#board-container`.

**Fonctions exportées :**
- `createBoard(container)` — génère defs, cadre, écuries, piste, couloirs, centre
- `initHorses(horses)` — crée les jetons SVG pour chaque cheval
- `moveHorse(horse)` — repositionne un cheval avec animation CSS (`transition: transform 0.35s`)
- `setMovable(color, ids, onClick)` — ajoute classe `can-move`, `tabindex="0"`, handlers
- `clearHighlights()` — retire tous les états de sélection
- `updateHorseLabel(color, id, label)` — met à jour `aria-label` pendant la phase de sélection
- `markLastMoved(color, id)` / `clearLastMoved()` — repère persistant sur le dernier pion déplacé

---

### `js/sound.js` — Sons

```js
loadSounds()    // précharge tous les MP3 via Audio()
unlockAudio()   // débloque l'audio sur iOS (doit être appelé depuis un geste utilisateur)
play(name)      // joue un son par nom
```

Sons disponibles : `dice-roll`, `dice-six`, `move`, `exit-stable`, `capture`, `home-stretch`, `victory`, `pass-turn`, `pass-phone`.

---

### `js/main.js` — Orchestrateur

Point d'entrée du bundle. Gère le cycle de vie d'une partie locale **et** en ligne.

**État global — local :**
```js
let state = null;          // objet de jeu (voir createGame)
let aiPlayers = new Set(); // couleurs contrôlées par Bernard
const sessionScores = {};  // { color: nbVictoires } — persiste entre parties
```

**État global — online (ajouté en juin 2026) :**
```js
let isOnline = false;         // true quand une partie en ligne est en cours
let myColor = null;           // couleur du joueur local ('red' | 'green' | ...)
let onlineSeq = -1;           // numéro de séquence pour éviter le retraitement de doublons
let onlinePlayersMap = {};    // { color: name } pour les pseudos en ligne
let roomUnsub = null;         // fonction de désinscription des listeners Firebase
let lastOnlineAction = null;  // dernière action reçue pour les sons/annonces distants
```

**Flux principal (local) :**
```
startGame() → initHorses() → showScreen('game') → beginTurn()
  → [IA] setTimeout(aiPlayTurn, 1800)
  → [Humain] setDiceEnabled(true)

onDiceClick() / aiPlayTurn()
  → rollDice() → animateDice()
  → getValidMoves() → onHorseSelected()
  → endTurn(extraTurn) → advanceTurn() → beginTurn()
```

**Flux online (modifications en juin 2026) :**
```
beginTurn()
  → si isOnline && state.currentColor !== myColor : désactiver dé, annoncer le tour, STOP
  → si isOnline && state.currentColor === myColor : activer dé normalement

onDiceClick()
  → après rollDice : si isOnline → syncOnlineState('dice', { dice: value })

onHorseSelected()
  → après applyMove : si isOnline → syncOnlineState('move', { horseId })
  → si win && isOnline → setRoomStatus('finished')

onRemoteGameState(gs) [listener Firebase]
  → ignore si gs.seq <= onlineSeq (doublon)
  → met à jour state, board, sons, annonces selon gs.lastAction
  → si c'est notre tour : active le dé
```

**`syncOnlineState(actionType, detail)`** — écrit l'état complet du jeu dans Firebase :
```js
await writeGameState({
  horses: state.horses,
  players: state.players,
  currentColor: state.currentColor,
  phase: state.phase,
  winMode: state.winMode,
  seq: onlineSeq + 1,
  lastAction: { type: actionType, byColor: myColor, ...detail }
});
```

**Raccourcis clavier (`handleKeyboard`) :**

Préfixe : `Alt+Shift`. Utilise `e.code` (position physique, indépendante du layout).

| `e.code` | Touche AZERTY | Action |
|---|---|---|
| `KeyD` | D | Lancer le dé (phase rolling, joueur humain) |
| `Digit1`–`Digit4` | 1–4 | Sélectionner le cheval n (phase selecting) |
| `KeyS` | S | Lire la situation |
| `KeyQ` | A | Répéter la dernière annonce |

> **Piège AZERTY** : la touche "A" du clavier français est à la position physique "Q" (QWERTY). `e.code === 'KeyQ'` pour la touche "A".

---

### `js/online.js` — Module Firebase (juin 2026)

Gère toute l'interaction avec Firebase : auth, salons, présence, sync.

**Config Firebase :**
```js
apiKey: 'AIzaSyBKEtNjA0JOwUSP1lUjxXWHkkK_pDZPf_c'   // clé publique, sans risque (voir note sécurité)
authDomain: 'petits-chevaux-online.firebaseapp.com'
databaseURL: 'https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app'
projectId: 'petits-chevaux-online'
appId: '1:275251725173:web:06839fa2ae3f087a89093c'
```

**Identité des joueurs :**
- Firebase Auth **anonyme** : UID unique créé automatiquement à la première connexion, persisté dans le localStorage du navigateur
- Pseudo stocké dans `localStorage` sous la clé `petits-chevaux-player-name` → pré-rempli aux visites suivantes
- Pas de compte, pas de mot de passe — volontairement ultra-simple pour le public H2VL

**Structure de la base de données :**
```
rooms/
  $roomId/
    config/       # hostId, hostName, maxPlayers, public, code, createdAt, winMode
    players/
      $uid/       # name, color, connected, lastSeen
    status/       # 'waiting' | 'playing' | 'finished'
    gameState/    # état complet du jeu (horses, players, currentColor, phase, seq, lastAction)

publicRooms/
  $roomId/        # hostName, playerCount, maxPlayers, winMode (pour la liste publique)

roomCodes/
  $code/          # roomId (lookup code privé 6 chiffres → roomId)
```

**Fonctions exportées :**

| Fonction | Rôle |
|---|---|
| `initFirebase()` | Initialise l'app Firebase (idempotent) |
| `isFirebaseAvailable()` | Vérifie que le SDK Firebase est chargé |
| `signIn()` | Connexion anonyme (idempotent) |
| `getUid()` | UID du joueur courant |
| `isHost()` | Vrai si le joueur est l'hôte du salon |
| `getCurrentRoomId()` | ID du salon actuel |
| `getSavedName()` / `saveName(name)` | Lecture/écriture du pseudo dans localStorage |
| `createRoom({playerName, maxPlayers, isPublic, winMode})` | Crée un salon, retourne `{ roomId, code }` |
| `joinRoom(roomId, playerName)` | Rejoint un salon par ID |
| `joinRoomByCode(code, playerName)` | Rejoint un salon par code 6 chiffres |
| `listenPublicRooms(callback)` | Écoute la liste des salons publics (retourne unsub) |
| `listenRoom(roomId, callbacks)` | Écoute players/status/gameState d'un salon |
| `writeGameState(gs)` | Écrit l'état du jeu dans Firebase |
| `setRoomStatus(status)` | Change le statut du salon (retire de publicRooms si playing/finished) |
| `leaveRoom()` | Quitte proprement : supprime la room si host, retire le joueur sinon |
| `cleanupAll()` | Désinscrit tous les listeners actifs |

**Gestion de la déconnexion brutale (Alt+F4, fermeture appli) :**
- `onDisconnect().set(false)` sur `players/$uid/connected`
- `onDisconnect().remove()` sur `rooms/$roomId`, `publicRooms/$roomId`, `roomCodes/$code` (host uniquement)
- Ces handlers sont **annulés** lors d'un `leaveRoom()` propre
- Firebase détecte la coupure en ~60 secondes et exécute les `onDisconnect`

**Couleurs :**
- L'hôte est toujours **Rouge**
- Les joiners reçoivent la prochaine couleur disponible dans l'ordre : Vert → Jaune → Bleu

---

## Firebase — Configuration et déploiement

### Projet Firebase

- **Project ID** : `petits-chevaux-online`
- **Realtime Database** : `petits-chevaux-online-default-rtdb` (région `europe-west1`)
- **Auth** : anonyme activé, domaine `ateliernumerique37-tech.github.io` autorisé
- **Règles** : `database.rules.json` → à déployer avec `firebase deploy --only database`

### Comment tout a été mis en place (CLI uniquement, juin 2026)

La console Firebase a posé des problèmes — voilà ce qui a fonctionné et ce qui n'a pas fonctionné :

**Ce qui NE fonctionne PAS :**
- `firebase database:instances:create` → erreur "run firebase init database first"
- `firebase init database` → interactif, ne se pipe pas
- La console Firebase pour activer l'auth anonyme → **demande de passer à Identity Platform (payant)** → NE PAS LE FAIRE

**Ce qui FONCTIONNE (séquence complète) :**

```bash
# 1. Activer l'API Firebase Realtime Database
gcloud services enable firebasedatabase.googleapis.com --project=petits-chevaux-online

# 2. Créer l'instance de base de données via l'API REST
ACCESS_TOKEN=$(gcloud auth print-access-token)
curl -X POST "https://firebasedatabase.googleapis.com/v1beta/projects/petits-chevaux-online/locations/europe-west1/instances?databaseId=petits-chevaux-online-default-rtdb" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-goog-user-project: petits-chevaux-online" \
  -d '{"type":"DEFAULT_DATABASE"}'

# 3. Activer l'auth anonyme via l'API v2 (PAS via la console)
curl -X PATCH "https://identitytoolkit.googleapis.com/v2/projects/petits-chevaux-online/config?updateMask=signIn.anonymous.enabled" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-goog-user-project: petits-chevaux-online" \
  -d '{"signIn":{"anonymous":{"enabled":true}}}'

# 4. Ajouter le domaine GitHub Pages aux domaines autorisés
curl -X PATCH "https://identitytoolkit.googleapis.com/v2/projects/petits-chevaux-online/config?updateMask=authorizedDomains" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-goog-user-project: petits-chevaux-online" \
  -d '{"authorizedDomains":["localhost","petits-chevaux-online.firebaseapp.com","petits-chevaux-online.web.app","ateliernumerique37-tech.github.io"]}'

# 5. Déployer les règles de sécurité
firebase deploy --only database --project petits-chevaux-online
```

### Déployer les règles de sécurité

Après toute modification de `database.rules.json` :
```bash
firebase deploy --only database --project petits-chevaux-online
```

### Nettoyer la base de données (rooms orphelines)

```bash
ACCESS_TOKEN=$(gcloud auth print-access-token)
# Voir le contenu
curl "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/.json?access_token=$ACCESS_TOKEN"
# Supprimer tout
curl -X DELETE "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/rooms.json?access_token=$ACCESS_TOKEN"
curl -X DELETE "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/publicRooms.json?access_token=$ACCESS_TOKEN"
curl -X DELETE "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/roomCodes.json?access_token=$ACCESS_TOKEN"
```

### Sécurité — note sur la clé API Firebase

La clé `AIzaSyBKEtNjA0JOwUSP1lUjxXWHkkK_pDZPf_c` est détectée par GitHub comme "secret" → **ignorer l'alerte, c'est un faux positif**. Les clés API Firebase sont conçues pour être publiques (elles identifient le projet, pas un utilisateur). La sécurité repose sur les règles RTDB et l'auth anonyme, pas sur la clé.

---

## Règles de sécurité Firebase (`database.rules.json`)

```json
rooms/$roomId :
  .read  = true (lecture publique)
  .write = création par le futur host OU suppression par le host actuel

  config :
    .write = création OU host existant
    .validate : hostId, hostName, maxPlayers, public, createdAt, winMode requis

  players/$playerId :
    .write = le joueur lui-même OU le host

  gameState :
    .write = tout joueur du salon (newData ou data)
    .validate : currentColor, phase, seq requis

  status :
    .write = host (data ou newData) OU tout joueur
    .validate : waiting | playing | finished

publicRooms/$roomId :
  .write = tout utilisateur authentifié
  .validate : hostName, playerCount, maxPlayers requis

roomCodes/$code :
  .read  = authentifié uniquement
  .write = authentifié uniquement
```

> **Piège règles multi-path** : l'update atomique de création (`db.ref().update(...)`) écrit rooms + publicRooms + roomCodes en une seule opération. Les règles `status` et `gameState` utilisent `newData.parent()` comme fallback car `data.parent()` est vide lors de la création.

---

## Accessibilité — règles à ne pas casser

1. **Ne jamais annoncer deux fois le même texte via la même région ARIA** — toujours passer par `announce()` qui alterne automatiquement entre `aria-status-a` et `aria-status-b`.

2. **`urgent = true`** pour les événements qui interrompent (triple 6, capture, victoire).

3. **Focus management** : `setTimeout(() => btn-dice.focus(), 50)` en début de tour humain. Les 50ms évitent la collision avec `requestAnimationFrame`.

4. **`aria-label` sur les chevaux** : mis à jour par `updateHorseLabel` pendant la sélection.

5. **Verbosité — éviter les doublons** (audit juin 2026) : `#turn-banner` et `#dice-result` sont **visuels uniquement** (pas d'`aria-live`).

6. **Libellés de boutons = texte visible** : pas d'`aria-label` redondant. WCAG 2.5.3.

7. **Pions = boutons d'action** : ne PAS remettre `aria-pressed` (ferait annoncer "bouton bascule").

8. **Nettoyer les écouteurs des pions** : `_pickHandler` et `_keyHandler` stockés et retirés dans `clearHighlights`.

---

## PWA et déploiement

### Service Worker

Stratégie **cache-first**. Version actuelle : `petits-chevaux-v17`.
Incrémenter `CACHE` à chaque déploiement modifiant des fichiers statiques.

### GitHub Pages

- Branche : `master`
- Déclencheur : push → deploy automatique en ~1 min
- Surveiller avec : `gh run list --repo ateliernumerique37-tech/petits-chevaux`

---

## CSS — points clés

- CSS custom properties dans `:root`, surchargées pour `prefers-color-scheme: dark` et `prefers-contrast: more`
- `@media (prefers-reduced-motion: reduce)` : toutes les animations désactivées
- `[hidden] { display: none !important; }` : garantit que `hidden` l'emporte sur `display:flex`
- `.sr-only` : masquage visuel conforme WCAG

### Écrans en ligne (ajoutés juin 2026)

Les 4 écrans online (`screen-online-menu`, `screen-online-create`, `screen-online-join`, `screen-online-lobby`) partagent le même fond que le setup (dégradé sombre + animation `hero-gradient`).

Classes CSS notables :
- `.btn-online` : bouton violet gradient (`#6a1b9a → #ab47bc`)
- `.btn-online-secondary` : fond translucide blanc
- `.online-error` : boîte d'erreur rouge
- `.join-code-row` + `.join-code-input` : saisie du code 6 chiffres (grand texte centré)
- `.online-divider` : séparateur "ou" avec lignes
- `.public-rooms-list` + `.public-room-item` : liste scrollable de salons cliquables
- `.lobby-code` : affichage du code privé en grand (or)
- `.lobby-players` + `.lobby-player` : liste joueurs avec pastille de couleur + tags "Vous"/"Hôte"

### Responsive — `.screen-game` en CSS Grid

- **Portrait** : colonne unique `header / log / board / footer`, max-width 600px centré
- **Paysage** (`orientation: landscape and max-height: 600px`) : deux colonnes `board | sidebar`
- **Taille plateau** : `min(100cqw, 100cqh)` — carré parfait dans le conteneur

---

## Décisions de conception et pièges connus

| Sujet | Décision | Raison |
|---|---|---|
| ARIA live dual-region | Deux `<div role="status">` alternées | Lecteur d'écran ignore les régions dont le contenu n'a pas changé |
| `e.code` vs `e.key` | `e.code` pour tous les raccourcis | Indépendant de la disposition clavier |
| `skipWaiting()` immédiat | Oui, dès l'install | Garantit que la nouvelle version est chargée sans intervention |
| IA synchrone | Délais `setTimeout` (1800ms + 800ms) | Donne l'impression que Bernard "réfléchit" |
| Scores de session | Objet en mémoire, perdu au rechargement | Suffisant pour une session |
| SDK Firebase compat (CDN) | `firebase-*-compat.js` via `<script>` | Compatible avec esbuild IIFE : `window.firebase` global, pas d'import ESM |
| Auth anonyme Firebase | Activée via API REST, PAS via console | La console demande de passer à Identity Platform (payant) — refuser |
| Comptes anonymes dormants | Pas de nettoyage automatique | Gratuits en nombre illimité sur le plan Spark de Firebase, pas un problème pratique |
| Clé API Firebase dans le code | Normale, sans risque | Clé publique par conception (identifie le projet, pas un droit d'accès) |
| `onDisconnect().remove()` sur la room | Oui, côté host | Évite les rooms orphelines si le host ferme le navigateur brutalement (~60s de délai) |
| Règle `.write` room niveau racine | Création ET suppression | Multi-path update : écrire config+status+players en une opération nécessite un `.write` racine |

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
gh run view <RUN_ID> --repo ateliernumerique37-tech/petits-chevaux

# Déployer les règles Firebase RTDB
firebase deploy --only database --project petits-chevaux-online

# Voir le contenu de la base Firebase
ACCESS_TOKEN=$(gcloud auth print-access-token)
curl "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/.json?access_token=$ACCESS_TOKEN"

# Nettoyer les rooms orphelines
curl -X DELETE "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/rooms.json?access_token=$ACCESS_TOKEN"
curl -X DELETE "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/publicRooms.json?access_token=$ACCESS_TOKEN"
curl -X DELETE "https://petits-chevaux-online-default-rtdb.europe-west1.firebasedatabase.app/roomCodes.json?access_token=$ACCESS_TOKEN"

# Activer l'auth anonyme Firebase (si besoin de reconfigurer)
ACCESS_TOKEN=$(gcloud auth print-access-token)
curl -X PATCH "https://identitytoolkit.googleapis.com/v2/projects/petits-chevaux-online/config?updateMask=signIn.anonymous.enabled" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-goog-user-project: petits-chevaux-online" \
  -d '{"signIn":{"anonymous":{"enabled":true}}}'
```
