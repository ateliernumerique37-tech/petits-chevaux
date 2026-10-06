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
├── service-worker.js   # Cache offline (strategy: network-first depuis v18), auto-update via skipWaiting
├── bundle.js           # Artefact de build (NE PAS éditer directement)
├── firebase.json       # Config Firebase (pointe vers database.rules.json)
├── database.rules.json # Règles de sécurité Firebase Realtime Database
├── sounds/             # Fichiers MP3 (10 sons)
│   ├── dice-roll.mp3
│   ├── dice-six.mp3
│   ├── move.mp3
│   ├── exit-stable.mp3
│   ├── capture.mp3
│   ├── home-stretch.mp3
│   ├── victory.mp3
│   ├── defeat.mp3      # Défaite contre l'IA ou en ligne (ElevenLabs)
│   ├── pass-turn.mp3
│   └── pass-phone.mp3  # Gardé dans les assets (son encore présent)
└── js/                 # Sources ES Modules, toutes committées
    ├── main.js         # Orchestrateur — initialisation, gestion des tours, clavier, online
    ├── online.js       # Module Firebase — auth anonyme, salons, sync temps réel
    ├── game.js         # Logique pure du jeu (pas de DOM)
    ├── ui.js           # Couche UI : écrans, annonces ARIA, boutons
    ├── board.js        # Rendu SVG du plateau + gestion des pièces
    └── sound.js        # Chargement et lecture des sons
```

> **Règle Git** : pas de `.gitignore` dans ce projet — `bundle.js` et tous les fichiers `js/` sont commités.

---

## Build

```bash
cd Projets/petits-chevaux
npx esbuild js/main.js --bundle --outfile=bundle.js --format=iife --platform=browser
```

À faire **après chaque modification** d'un fichier `js/`. Aucun watch mode, aucune étape de test.
Le build produit environ **74 kb** (IIFE, non minifié) depuis l'ajout du module online.

### Stratégie de cache service worker (network-first depuis v18)

**Le cœur de l'app (HTML, JS, CSS, manifest) est servi en network-first** : le SW va
toujours chercher la dernière version en ligne, et ne retombe sur le cache qu'en mode
hors ligne. Les **sons** restent en cache-first (gros fichiers, immuables).

Conséquence : **la fraîcheur de la PWA ne dépend plus du bump de `CACHE`**. Tant que
l'appareil est en ligne, la PWA charge toujours la dernière version déployée — même si
on oublie d'incrémenter le numéro.

Le bump de `CACHE = 'petits-chevaux-vN'` (version actuelle : **v32**) reste utile mais
**non critique** : il sert seulement à purger les anciens caches au prochain `activate`.

> **Historique du bug (juin 2026)** : avant v18, la stratégie était **cache-first**.
> Toute la fraîcheur reposait sur le bump manuel de `CACHE` à chaque déploiement. Un
> déploiement (écran de config) a modifié `index.html`/`bundle.js` **sans** changer
> `service-worker.js` → fichier SW byte-identique → `reg.update()` ne détecte rien →
> le nouveau bundle n'est jamais re-téléchargé. Le navigateur s'en sortait (Ctrl+F5
> bypasse le SW) mais la **PWA standalone** restait bloquée sur l'ancien cache
> (pas de rechargement forcé possible). Désinstaller/réinstaller la PWA était le seul
> contournement. Le passage en network-first élimine définitivement ce mode d'échec.

Le mécanisme client (dans `index.html`) reste en place : `reg.update()` au chargement
et au retour au premier plan, `updatefound` → `SKIP_WAITING` → `controllerchange` →
`window.location.reload()`. Il propage proprement un vrai changement de SW.

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
| `applyTripleSixPenalty(state)` | Renvoie à l'écurie le cheval le plus avancé **du circuit** (0-51). Les chevaux du couloir d'arrivée sont protégés ; si aucun cheval sur le circuit → tour perdu sans renvoi |
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

Sons disponibles : `dice-roll`, `dice-six`, `move`, `exit-stable`, `capture`, `home-stretch`, `victory`, `defeat`, `pass-turn`, `pass-phone`.
À la fin d'une partie, `defeat` joue si une IA gagne en local ou si un autre joueur
gagne en ligne. `victory` reste utilisé pour une victoire personnelle et pour toutes
les fins de partie en local humain contre humain sur le même appareil.

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

**Robustesse en partie (audit juin 2026) :**
- **Départ d'un joueur en pleine partie** (`handleMidGameDepartures` dans main.js) : annonce
  urgente, couleur retirée de la rotation (ses chevaux restent sur le plateau), **victoire par
  abandon** si un seul joueur reste, relance arbitrée du tour si c'était au partant de jouer
  (arbitre = première couleur restante → écrivain unique, pas de conflit).
- **Filet anti-blocage** dans `beginTurn` : les tours des couleurs non contrôlées
  (`connected === false` posé par Firebase après ~60 s de coupure réelle) sont passés avec annonce.
- **Reconnexion** : dans `joinRoom`, le test « joueur déjà membre » précède le test de statut →
  un joueur déjà dans la room peut revenir même quand `status === 'playing'` (via code privé ;
  les rooms publiques en partie ne sont plus listées). ⚠️ Ne jamais remettre le test de statut
  en premier : ça rend la reconnexion impossible.
- **Annonces distantes complètes** (`turn-start` avec `prevCell`, `prevBounced`, `prevCaptured`,
  `prevReplay`) : le client distant annonce le déplacement (cheval + case, « rebondit et
  recule » pour un rebond du couloir), les captures (urgent si c'est le sien) et « rejoue » —
  indispensable aux joueurs malvoyants.
- **Écran de victoire protégé** : `onStatus(null)` est ignoré quand `state.phase === 'game-over'`
  (l'hôte qui ferme la room après la partie n'éjecte plus le perdant de l'écran de victoire).
- `disarmRoomAutoDelete` **re-arme la présence** après ses `cancel()` (un `cancel()` sur un
  chemin annule aussi les onDisconnect de tous ses enfants).
- `sweepOwnOrphanRoom` ne supprime **jamais** une room `playing` encore habitée par un adversaire.
- `publicRooms/$id/playerCount` : toujours en **transaction** (jamais lecture-puis-set).

---

## Compteurs de parties anonymes (octobre 2026)

- `gameCounters/$année` = `{ local, online, lastAt }` dans la RTDB. **Aucun identifiant, aucune
  donnée personnelle** n'est écrit. `countGame(kind)`, `flushPendingCounts()`,
  `fetchGameCounters()` dans `online.js`.
- Local : compté dans `startGame` (pas à la reprise de sauvegarde). En ligne : compté par l'hôte
  seul, au lancement (`startOnlineGame`).
- **File d'attente hors ligne** : chaque partie est d'abord stockée dans le localStorage
  (`petits-chevaux-pending-counts`), puis envoyée. Échec (hors ligne, SDK non chargé, refus des
  règles) → l'entrée reste et repart au lancement suivant, à l'événement `online`, ou à la
  partie suivante (retry avec délai croissant, max ~1 min dans la session).
- **Anti-triche** (règles) : écriture authentifiée (auth anonyme, aucun lien avec les compteurs),
  exactement +1 au total par écriture, `lastAt === now` et ≥ 2 s depuis la précédente (plafond
  global ≈ 1 partie / 2 s), suppression impossible. Ce n'est PAS infaillible (un script peut
  se connecter en anonyme) : un vrai verrou demande App Check ou une Cloud Function.
- Affichage : écran Statistiques (année en cours + total, années passées dans un `<details>`).
- **Livraison du 3 octobre 2026** : les commits `6703451` et `e4f000c` sont sur `master` ;
  GitHub Pages servait déjà la page Statistiques, le bundle des compteurs et le service worker
  `v30`. Les règles ont été publiées séparément avec
  `firebase deploy --only database --project petits-chevaux-online`. La version active a été
  relue puis comparée au JSON du dépôt : contenu identique. Une copie des règles précédentes
  est conservée localement hors du dépôt dans
  `../.deployment-backups/petits-chevaux/database.rules.before-2026-10-02.json`.
- **Vérifications** : syntaxe JS et JSON valide,
  `firebase deploy --only database --project petits-chevaux-online --dry-run`
  réussi. Sur les émulateurs Auth + RTDB d'un projet `demo-` isolé : lecture publique et
  incrément de +1 authentifié acceptés ; écriture sans authentification, incrément de +2,
  suppression et second incrément immédiat refusés. En production, la lecture publique de
  `/gameCounters.json` a répondu HTTP 200 avec `null` (aucune donnée encore enregistrée) ;
  l'écran Statistiques affichait les trois compteurs 2026 à zéro. Aucun incrément fictif
  n'a été fait en production : la première vraie partie reste à vérifier de bout en bout.
  La sortie vocale NVDA n'a pas été testée lors de cette livraison.
- SDK Firebase CDN passé de 10.12.2 à 12.19.0 (compat). `npm audit` signalait @grpc/grpc-js
  (Firestore/Node), non embarqué par l'app.

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

9. **Une seule annonce de relance après un 6** (audit juillet 2026) : `beginTurn(replayMode)`
   accepte `null` (tour normal → « Tour de X + résumé »), `'announce'` (6 sans capture →
   « X rejoue. » court, SANS résumé — les positions viennent d'être annoncées coup par coup)
   ou `'silent'` (capture → l'annonce urgente de capture a DÉJÀ dit « Vous rejouez ! », ne
   rien répéter). `endTurn` n'annonce plus rien lui-même. Avant ce correctif, un 6 déclenchait
   « X rejoue ! » + « Tour de X. résumé. Lancez le dé. » + la lecture du bouton focus — trois
   annonces redondantes en rafale (pire avec capture : « rejoue » dit trois fois).

10. **Jamais de « Lancez le dé » dans un texte suivi d'un focus sur le bouton dé** : le
    lecteur d'écran lit déjà « Lancer le dé, bouton » à l'arrivée du focus — le répéter dans
    l'annonce fait un doublon systématique à chaque tour.

11. **Vérification des annonces en preview** : `announce()` pose le texte dans un
    `requestAnimationFrame` — suspendu dans un onglet caché/headless. Pour tester la séquence
    d'annonces en preview, stubber `window.requestAnimationFrame = cb => setTimeout(cb, 16)`
    puis observer les régions `aria-status-a/b` et `aria-alert` avec un MutationObserver
    (méthode validée en juillet 2026, séquence complète capturée et conforme).

---

## PWA et déploiement

### Service Worker

Stratégie **network-first** pour le cœur de l'app depuis v18 (voir section Build ci-dessus
pour le détail). Version actuelle : `petits-chevaux-v31`.
Incrémenter `CACHE` à chaque déploiement modifiant des fichiers statiques — reste une bonne
pratique même si non critique pour la fraîcheur avec le network-first.

### GitHub Pages

- Branche : `master`
- Déclencheur : push → deploy automatique en ~1 min
- Surveiller avec : `gh run list --repo ateliernumerique37-tech/petits-chevaux`
- Des échecs occasionnels de l'étape "Deploy to GitHub Pages" (`Deployment failed, try again
  later`) sont une instabilité passagère de l'infra GitHub, pas un problème du projet : le
  déploiement suivant republie l'intégralité de la branche, donc aucun contenu n'est perdu.
- `.nojekyll` (fichier vide à la racine) désactive le traitement Jekyll par défaut de GitHub
  Pages — nécessaire pour un site statique fait main (Jekyll ignorerait sinon tout fichier/
  dossier commençant par `_`, et impose un traitement inutile).

---

## SEO — référencement classique et moteurs IA (juillet–octobre 2026)

### Constat de départ

L'app est une SPA à écrans cachés par défaut (`hidden` sur `.screen`, révélés en JS via
`showScreen()`). Google exécute le JavaScript avant indexation, mais **de nombreux robots
IA (GPTBot, ClaudeBot, PerplexityBot...) font une lecture HTML brute sans exécuter de
script** — sans filet, ils ne verraient qu'une page vide.

### Ce qui a été mis en place

- **`<noscript>`** dans `index.html` : contenu textuel réel (titre, description, lien vers
  les règles) visible par tout robot qui ne rend pas le JS. C'est le filet le plus important.
- **JSON-LD `schema.org/VideoGame`** dans `<head>` de `index.html` : nom, description,
  gratuité (`isAccessibleForFree`), nombre de joueurs et propriétés d'accessibilité.
  Ces données décrivent le jeu sans exécution de JavaScript ; elles ne garantissent ni
  l'indexation ni un résultat enrichi dans Google.
- **Meta tags enrichis** : title/description orientés recherche (mots-clés : petits chevaux,
  ludo, jeu accessible, malvoyant, multijoueur en ligne), `<link rel="canonical">`,
  Open Graph + Twitter Card (partage sur réseaux sociaux et aperçus de liens).
- **`regles.html`** : déjà une page statique classique entièrement visible sans JS (donc
  déjà bien indexable) — meta description, canonical et OG ajoutés en plus.
- **`robots.txt` du projet** : publié sous `/petits-chevaux/`, mais les moteurs cherchent
  `robots.txt` à la racine du domaine. Le 3 octobre 2026, cette URL racine répondait 404 :
  aucun blocage d'exploration n'a été constaté. Le fichier du projet est informatif ; sa
  directive `Sitemap:` n'est pas un moyen fiable de faire découvrir le sitemap.
- **`sitemap.xml`** : liste les deux URL canoniques (`/petits-chevaux/` et `regles.html`).
  `<lastmod>` reste absent tant que sa date ne peut pas être tenue à jour avec précision.
  Les champs `<changefreq>` et `<priority>`, ignorés par Google, ont été retirés. Le sitemap
  est public, mais son dépôt dans Google Search Console n'a pas été vérifié.
- **`llms.txt`** : résumé Markdown à `/petits-chevaux/llms.txt` avec liens vers le jeu,
  les règles et la documentation. Cette position sous un chemin de site de projet est prévue
  par la proposition llms.txt v2. `rel="describedby"` dans les deux pages HTML le signale aux
  agents qui prennent en charge cette relation. Sa présence ne garantit aucune utilisation
  par les moteurs de recherche ou les assistants IA.
- **`og-image.png`** (1200×630, thème bois/or du plateau) : image de partage utilisée par
  toutes les balises `og:image`/`twitter:image`, sur `index.html` et `regles.html`. Générée
  depuis `og-image.svg` (conservé dans le repo comme source, non référencé/précaché) via
  `npx sharp-cli -i og-image.svg -o og-image.png resize 1200 630`. Un SVG seul n'est pas
  lu par Facebook/X pour les aperçus de lien (raster requis) — d'où le PNG en principal.
- **`404.html`** à la racine (`<meta name="robots" content="noindex, follow">`, servi
  nativement par GitHub Pages) : utilise des **chemins absolus** (`/petits-chevaux/style.css`,
  `/petits-chevaux/`) et non relatifs, car l'URL cassée peut être plus profonde que la racine
  (ex. `/petits-chevaux/xyz/abc`) — un chemin relatif se résoudrait alors par rapport à cette
  URL, pas à l'emplacement réel du fichier.
- **Favicon HTML explicite** (`<link rel="icon">`, réutilise l'icône PWA en data-URI SVG) sur
  `index.html`, `regles.html` et `404.html` — Google affiche les favicons dans les SERP mobiles.
- **JSON-LD `schema.org/Article`** sur `regles.html` (en plus du `VideoGame` sur `index.html`).
- **Audit historique** (juillet 2026) : score initial 78/100 avant les corrections de
  l'époque. Ce chiffre ne décrit pas l'état actuel. Le contrôle d'octobre 2026 a confirmé
  les deux pages publiques en HTTP 200, l'image de partage en HTTP 200 et la page introuvable
  en HTTP 404. Les descriptions de partage ne revendiquent plus une accessibilité « 100 % »
  que ce contrôle SEO ne peut pas attester ; la balise `meta keywords`, ignorée par Google,
  a été retirée.

### Limite structurelle assumée

GitHub Pages ne fait que du contenu statique — pas de rendu serveur (SSR) possible. Le
`<noscript>` et les données structurées sont le compromis pragmatique face à cette
contrainte, sans réécrire l'app en SPA server-rendered (hors de proportion pour ce projet).

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

- **Portrait** : colonne unique `header / log / board / footer`, max-width 760px centré
- **Paysage** (`orientation: landscape and max-height: 600px`) : deux colonnes `board | sidebar`
- **Taille plateau** : `min(100cqw, 100cqh)` — carré parfait dans le conteneur

### Agrandissement du plateau (juillet 2026 — retour testeur voyant)

Diagnostic : sur desktop/tablette, c'est quasi toujours la **hauteur** disponible qui limite
le plateau (`header` + `event-log` + `game-footer` ≈ 320px fixes), pas la largeur — augmenter
seulement `max-width` a un effet limité en pratique (mesuré : aucun gain sur la plupart des
fenêtres desktop courantes, 1024×768 à 1366×800, toutes height-bound).

Deux changements complémentaires, tous deux **sans impact accessibilité** (vérifié) :
- `max-width` de la colonne portrait : 600px → **760px** (aide sur les fenêtres où la largeur
  redevient le facteur limitant — fenêtres courtes, ou futurs ajustements de la hauteur des
  contrôles).
- `.event-log` : hauteur 74px → **58px**. Sans risque : cette section est `aria-hidden="true"`
  dans `index.html` (pur repère visuel pour voyants, les non-voyants reçoivent déjà tout via
  les régions ARIA live) — la réduire ne retire aucune information à personne.
- `.game-footer` : padding et gaps légèrement resserrés (`0.75rem 1rem 0.6rem` → `0.55rem 1rem
  0.45rem`, gap `0.5rem` → `0.4rem`). **Aucune cible tactile touchée** : `--min-touch: 44px`
  préservé sur tous les boutons (vérifié après coup : dice 70.5px, Situation/Répéter/Quitter
  toujours exactement 44px).

Gain mesuré (Chrome headless, 1366×800) : plateau 473px → 498px (+5 % linéaire, ~+11 % de
surface). Modeste mais garanti sûr. Mobile portrait et paysage téléphone : **non affectés**
(paysage téléphone a son propre `.event-log { height: auto }` qui prend le dessus).

> ⚠️ Un gain bien plus important existe (réutiliser la mise en page paysage `board | sidebar`
> aussi sur desktop large, pas seulement les téléphones tenus à l'horizontale) mais **change la
> disposition visuelle** (header/log/footer déplacés sur le côté) — non appliqué car l'utilisateur
> a demandé explicitement de garder le même rendu. À proposer séparément si besoin d'un gain plus
> visible.

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
# Committer et déployer (rebuild du bundle : voir section Build)
git add bundle.js js/main.js [autres fichiers modifiés]
git commit -m "description"
git push origin master

# Surveiller le déploiement
gh run list --repo ateliernumerique37-tech/petits-chevaux
gh run view <RUN_ID> --repo ateliernumerique37-tech/petits-chevaux
```

Pour rebuilder le bundle, déployer les règles Firebase, consulter/nettoyer la base ou
reconfigurer l'auth anonyme : voir respectivement les sections *Build*, *Déployer les règles
de sécurité*, *Nettoyer la base de données* et *Comment tout a été mis en place* ci-dessus.
