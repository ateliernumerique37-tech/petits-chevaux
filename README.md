# 🐴 Petits Chevaux — PWA accessible

Jeu de Petits Chevaux (Ludo français) jouable en solo, en local à plusieurs, ou **en ligne en multijoueur**, conçu en priorité pour les **utilisateurs malvoyants**.

🔗 **Jouer** : https://ateliernumerique37-tech.github.io/petits-chevaux/  
🔗 **Voir mes autres projets** : https://ateliernumerique37-tech.github.io/hub-numerique/

## Objectif du projet

Ce jeu a été développé pour l'association **H2VL (Handicap Visuel Val de Loire)**, dans le cadre de mon activité de coach en accessibilité numérique. La contrainte de départ n'était pas "faire un jeu de plateau", mais faire un jeu de plateau **jouable sans jamais voir l'écran** — un lecteur d'écran doit pouvoir annoncer chaque coup, chaque capture, chaque victoire, de façon claire et sans répétition inutile.

Trois modes de jeu :
- **Pass-and-play local** (2 à 4 joueurs sur le même appareil)
- **Solo contre l'IA** (Bernard, qui priorise victoire > capture > progression > sécurité)
- **Multijoueur en ligne**, chacun sur son propre appareil, synchronisé en temps réel

## Stack technique

Volontairement minimaliste, sans framework :

- **HTML / CSS / JavaScript vanille**, modules ES bundlés avec `esbuild`
- **Firebase Realtime Database** pour le multijoueur en ligne (salons, synchronisation des coups, présence des joueurs) — avec authentification anonyme, pour que jouer ne demande ni compte ni mot de passe
- **PWA** installable, avec un service worker en stratégie *network-first* pour l'essentiel de l'app (garantit que la dernière version est toujours chargée sans dépendre d'un versionnage manuel du cache)
- **Déploiement continu** sur GitHub Pages à chaque `push`

## Choix d'accessibilité — la partie qui compte vraiment

L'accessibilité n'est pas une couche ajoutée après coup, elle a dicté plusieurs décisions d'architecture :

- **Doubles régions ARIA alternées** (`aria-live="polite"`) : un lecteur d'écran ignore une annonce identique à la précédente. En alternant entre deux régions, chaque coup est bien annoncé, même s'il ressemble au précédent.
- **Gestion de focus explicite** : après chaque tour, le focus est renvoyé sur le bouton de lancer de dé, avec un léger délai pour éviter les conflits de rendu.
- **Raccourcis clavier basés sur la position physique** (`e.code`), pas sur la touche logique — pour rester cohérents quelle que soit la disposition (AZERTY/QWERTY).
- **Distinction rigoureuse entre affichage visuel et annonce sonore** : certains éléments (bandeau de tour, résultat du dé) sont volontairement *sans* `aria-live`, pour éviter de saturer l'utilisateur d'annonces redondantes avec ce qui est déjà dit ailleurs.
- **Respect strict de `prefers-reduced-motion`** et prise en charge du mode contraste élevé.
- **Étiquettes de boutons = texte visible**, sans `aria-label` redondant (conformité WCAG 2.5.3).

## Pour aller plus loin

Le détail technique complet (architecture des modules, structure Firebase, règles de sécurité, pièges rencontrés et leur résolution) est documenté dans [`CLAUDE.md`](./CLAUDE.md), qui sert de mémoire de développement au projet.

Les assistants qui lisent le site peuvent consulter son [résumé `llms.txt`](https://ateliernumerique37-tech.github.io/petits-chevaux/llms.txt), qui renvoie vers le jeu, les règles et la documentation.

---

*Développé par Saifeddin Ayedi — coach en accessibilité numérique, Tours (37).*
