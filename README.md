# OnlyHate

Plateforme satirique de roasts consentis: les utilisateurs y publient volontairement leurs fails et la communauté les chambrre. Parodie des codes premium des plateformes de créateurs (tiers, badges, hate-o-meter), **sans haine réelle**: moquerie du contenu, jamais de la personne.

## Stack

- **Front**: React 19 + TypeScript + Vite
- **Back**: Node HTTP sans framework, SQLite (`node:sqlite`), zéro dépendance serveur
- **Mobile (futur)**: Capacitor (config prête, voir §Mobile)

## Lancer

```bash
npm install
npm run dev     # API :8787 + Vite :5173 (proxy /api et /uploads)
```

Production locale:

```bash
npm run serve   # build + serveur Node sur :8787 (sert dist/ et l'API)
```

Le premier compte créé devient modérateur (`role: admin`).

## Fonctionnalités

- Comptes (scrypt + sessions persistées), avatar emoji
- Publication avec catégorie, limites de moquerie, image (3 Mo max), tier verrouillé
- Feed filtrable par catégorie, tri Récents / Top roasts
- Réactions uniques par utilisateur: 🔥 Roast, 🙄 Cringe, 👏 K.O.
- Vannes (commentaires) avec upvote unique
- Tier verrouillé parodique: le contenu se débloque en publiant une vanne
- Signalement confidentiel avec motif (haine, doxxing, menace, hors-charte)
- Modération admin: file de signalements, masquer posts/vannes, bannir, écarter
- Filtre anti-haine avant publication/commentaire (`server/blocked_terms.json`, extensible)
- Profils publics: stats et badges par palier de roasts reçus
- Charte dédiée

## Données

- `data/onlyhate.db` — base SQLite (créée au premier lancement, seed démo inclus)
- `data/uploads/` — images uploadées
- `server/blocked_terms.json` — liste de termes bloqués (normalisation accents/casse)

## Mobile

`capacitor.config.ts` est prêt (`appId: com.onlyhate.app`, `webDir: dist`). L'API est appelée via `VITE_API_URL` (relatif par défaut), donc un déploiement mobile doit pointer vers une API publique.

```bash
npm run cap:add:android   # nécessite Android SDK
npm run cap:add:ios       # nécessite Xcode (macOS)
npm run cap:sync
```

Blocage actuel sur ce poste: pas de SDK Android ni de Xcode installés — les builds device ne peuvent pas être produits ici.

## Scripts

| Script | Rôle |
| --- | --- |
| `npm run dev` | API + Vite en parallèle |
| `npm run api` | API seule |
| `npm run web` | Vite seul |
| `npm run build` | `tsc -b` + `vite build` |
| `npm run serve` | build puis serveur de production |
| `npm run cap:*` | intégration Capacitor |
