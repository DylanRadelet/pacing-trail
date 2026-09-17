# Pacing Run

Préparer sa stratégie de trail : import d'un GPX, carte + profil altimétrique précis,
temps de passage et ravitaillements. Tout tourne en local, sans base de données :
chaque course est enregistrée dans `data/races/<id>.json`.

## Lancer

```bash
pnpm install
pnpm dev
```

Puis ouvrir http://localhost:3000.

## Sur le téléphone (même Wi-Fi que le PC)

```bash
pnpm build
pnpm start
```

Ouvrir `http://<IP-du-PC>:3000` sur le téléphone (IP visible avec `ipconfig`, ex. `192.168.0.80`).
Au premier lancement, autoriser Node.js dans le pare-feu Windows pour les réseaux privés.

## Utilisation

- **Importer un fichier GPX** : la trace est lue point par point ; les waypoints du GPX situés
  à moins de 150 m du parcours sont proposés comme ravitos.
- **Toucher le profil ou la trace** : km, altitude, pente, D+/D- cumulés et temps prévu à cet endroit,
  avec les boutons « Passage ici » / « Ravito ici ».
- **Temps de passage** : km + temps depuis le départ. L'allure et le D+ de chaque tronçon sont calculés.
- **Heure de départ** : affiche l'heure de passage à chaque point.
- Tout est enregistré automatiquement dans le JSON.

## Précision des calculs

- Distances géodésiques sur l'ellipsoïde WGS84 (formule de Vincenty) entre chaque point du GPX,
  sans simplification de la trace.
- D+ / D- sur l'altitude lissée sur 40 m pour gommer le bruit GPS.
- Temps estimés (≈) entre deux passages répartis au prorata des km-effort (100 m de D+ = 1 km),
  au-delà du dernier passage extrapolés à l'allure moyenne du plan.

## Code

- `src/lib/race/` : lecture GPX, géodésie, calcul de la trace et du plan, stockage JSON.
- `src/app/api/races/` : API locale (création, modification, suppression).
- `src/components/features/race/` : carte (Leaflet), profil, plan, formulaires.
