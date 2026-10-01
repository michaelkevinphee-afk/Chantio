# Chantio

Les fiches d'intervention des artisans du bâtiment, simplement.
Le technicien remplit sa fiche sur son téléphone (même sans réseau), le bureau
la reçoit, la valide et la passe en facturation.

## Ce que contient ce dépôt

| Dossier | Ce que c'est | Pour qui |
| --- | --- | --- |
| `apps/mobile` | L'appli du technicien (iPhone et Android, avec Expo) | Techniciens, et le dirigeant sur le terrain |
| `apps/web` | Le back office (site web, avec Next.js) | Dirigeant, chef de chantier, assistant(e) |
| `packages/shared` | Le code commun aux deux : libellés, gabarit de fiche, couleurs | — |
| `supabase` | La base de données, ses règles de sécurité et ses tests | — |

## Ce que fait la V1 aujourd'hui

1. **Connexion sans mot de passe** : on saisit son e-mail, on reçoit un code à 6 chiffres.
2. **Premier lancement** : l'artisan crée son entreprise et en devient le dirigeant (mode solo possible).
3. **Équipe** : le dirigeant ajoute ses techniciens par e-mail ; leur compte est relié à leur première connexion.
4. **Interventions** : le bureau crée une intervention (client, adresse, motif, date, technicien).
   Elle passe seule de « À planifier » à « Planifiée » dès qu'elle a une date et un technicien.
5. **Fiche sur le téléphone** : constat et photos, mesures, pièces, résultat, temps passé, signature du client (optionnelle).
   La fiche est gardée sur le téléphone et part dès que le réseau revient.
6. **Validation** : la fiche arrive « À valider » au bureau ; le dirigeant ou le chef de chantier la valide
   ou la renvoie au technicien, puis la marque « Facturée ».

Cycle d'une intervention :
`À planifier → Planifiée → En cours → À valider (ou À reprendre) → Validée → Facturée`

### Sécurité

- Une seule base pour toutes les entreprises clientes, mais chaque entreprise ne voit **que ses données** :
  la règle est appliquée par la base elle-même, pas seulement par l'appli.
- Un technicien ne voit que les interventions qui lui sont affectées ; un sous-traitant ne voit que ses clients.
- Les étapes clés (démarrer, envoyer, valider, facturer) passent par des fonctions qui vérifient les droits.
- Les photos sont dans un stockage privé, rangées par entreprise ; le bureau les voit par des liens temporaires.
- Tout changement sur les interventions, les fiches et l'équipe est inscrit dans un journal.
- Ces règles sont testées automatiquement à chaque modification (`supabase/tests/test_securite.sql`).

## Mettre en ligne : les comptes à créer

| Service | Pourquoi | Coût de départ |
| --- | --- | --- |
| [Supabase](https://supabase.com) | La base de données, les comptes et les photos | Gratuit pour démarrer |
| [Vercel](https://vercel.com) | Héberger le site du bureau | Gratuit pour démarrer |
| [Expo](https://expo.dev) | Construire l'appli et la publier sur l'App Store et Google Play | Gratuit pour démarrer |
| Apple Developer et Google Play Console | Publier l'appli dans les magasins | 99 €/an et 25 € une fois |

### Étapes (une fois les comptes créés)

1. **Supabase** : créer un projet (région Europe, par exemple Paris ou Francfort).
   - Envoyer la base : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
   - Dans *Authentication → Email Templates*, modèle « Magic Link » et « Confirm signup » :
     coller le contenu de `supabase/templates/code.html` (il affiche le code à 6 chiffres).
   - Noter l'adresse du projet et la clé `anon` (*Project Settings → API*).
2. **Vercel** : importer le dépôt GitHub, dossier racine `apps/web`, et renseigner
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **Expo** : renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (fichier `apps/mobile/.env`), puis construire l'appli avec EAS (`npx eas-cli build`).

## Pour les développeurs

Prérequis : Node 22 et pnpm 10.

```bash
pnpm install
pnpm dev:web          # site du bureau sur http://localhost:3000
pnpm dev:mobile       # appli : scanner le QR code avec Expo Go
pnpm test             # tests du code partagé
pnpm typecheck        # vérification des types partout
pnpm test:db          # tests de la base (PostgreSQL local, variables PGHOST/PGUSER…)
```

Copier `apps/web/.env.example` en `apps/web/.env.local` et `apps/mobile/.env.example` en `apps/mobile/.env`.
Pour une base locale complète (avec Docker) : `npx supabase start`, qui applique les migrations et
`supabase/seed.sql` (entreprise Verger d'exemple ; se connecter avec `christophe@verger.example`,
le code arrive dans la boîte de test affichée par `supabase start`).

Conventions : le code, les noms et les messages sont en français. Toute modification de la base
passe par une nouvelle migration dans `supabase/migrations`, accompagnée de tests dans `supabase/tests`.

## Prochaines étapes prévues (V1)

Rapport PDF envoyé au client, planning glisser-déposer, import Excel des clients et articles,
export vers les logiciels de gestion (CSV), notifications, code à 4 chiffres pour rouvrir l'appli,
console éditeur. Voir la spécification pour le détail.
