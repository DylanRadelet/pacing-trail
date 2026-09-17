# Pacing Run

Préparer sa stratégie de trail : import d'un GPX, carte + profil altimétrique précis,
temps de passage, ravitaillements et un mode course plein écran, sans base de données.

Deux façons de l'utiliser :

- **Sur le PC** (`pnpm dev`) : chaque course est un fichier JSON dans `data/races/<id>.json`.
- **Sur le téléphone** (version en ligne, ex. Vercel) : les courses sont enregistrées dans le
  navigateur du téléphone et l'app fonctionne hors-ligne.

## Lancer sur le PC

```bash
pnpm install
pnpm dev
```

Puis ouvrir http://localhost:3000.

## Sur le téléphone (version en ligne)

1. Déployer le repo sur Vercel (aucune configuration nécessaire). En ligne, `/` redirige vers
   `/telephone` et l'API refuse les écritures : rien n'est stocké sur le serveur.
2. Sur le téléphone, ouvrir l'URL dans Chrome puis ⋮ → « Ajouter à l'écran d'accueil ».
3. Importer le GPX directement, ou le JSON préparé sur le PC (bouton « Envoyer vers le téléphone »
   sur la page de la course).
4. Ouvrir une fois le mode course avec du réseau : ensuite il fonctionne sans réseau
   (service worker `public/sw.js`), et l'écran reste allumé pendant la course.

## Utilisation

- **Importer un fichier GPX** : la trace est lue point par point ; les waypoints du GPX situés
  à moins de 150 m du parcours sont proposés comme ravitos.
- **Toucher le profil ou la trace** : km, altitude, pente, D+/D- cumulés et temps prévu à cet endroit,
  avec les boutons « Passage ici » / « Ravito ici ».
- **Temps de passage** : km + temps depuis le départ. L'allure et le D+ de chaque tronçon sont calculés.
- **Heure de départ** : affiche l'heure de passage à chaque point.
- **Mode course** : profil seul en portrait ; pincer, double-taper, glisser, ou boutons 1/2/5 km pour zoomer.
- Tout est enregistré automatiquement.

## Précision des calculs

- Distances géodésiques sur l'ellipsoïde WGS84 (formule de Vincenty) entre chaque point du GPX,
  sans simplification de la trace.
- D+ / D- sur l'altitude lissée sur 40 m pour gommer le bruit GPS.
- Temps estimés (≈) entre deux passages répartis au prorata des km-effort (100 m de D+ = 1 km),
  au-delà du dernier passage extrapolés à l'allure moyenne du plan.

## Code

- `src/lib/race/` : lecture GPX, géodésie, calcul de la trace et du plan, stockage (disque ou navigateur).
- `src/app/api/races/` : API locale (création, modification, suppression, export JSON).
- `src/components/features/race/` : carte (Leaflet), profil, plan, mode course, formulaires.
- `src/components/features/phone/` et `src/app/telephone/` : version téléphone hors-ligne.
