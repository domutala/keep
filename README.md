# Keep

Keep est une application de notes open source inspirée de Google Keep. Elle
peut être utilisée sans compte grâce à une session partageable, ou avec une
connexion par code à usage unique envoyé par e-mail.

Le projet est conçu pour être forké et étendu. Le frontend et le backend
exposent des hooks typés, et l’API Fastify peut fonctionner sans l’interface
Vue.

## Fonctionnalités

- notes en texte riche avec Tiptap et sauvegarde automatique ;
- listes à cases à cocher ;
- création, modification et suppression de notes ;
- dossiers et sous-dossiers sans limite de profondeur ;
- catégories colorées pour classer et filtrer notes et dossiers ;
- vues grille masonry et Kanban par catégorie avec glisser-déposer ;
- navigation par URL et fil d’Ariane ;
- sessions anonymes partageables et fusionnables ;
- synchronisation temps réel entre plusieurs appareils ;
- connexion sans mot de passe avec un code à six chiffres ;
- profil utilisateur avec nom et avatar ;
- interface responsive avec shadcn-vue et Tailwind CSS ;
- mode API autonome ;
- extensions frontend et backend typées.

## Stack

- [Runable](https://runablejs.com/docs) et Vue 3 ;
- Pinia pour l’état client ;
- Fastify pour l’API HTTP ;
- Neon/PostgreSQL pour la persistance ;
- Tiptap pour l’éditeur de notes ;
- Vue.Draggable/SortableJS pour la vue Kanban ;
- shadcn-vue, Tailwind CSS et Lucide pour l’interface ;
- Resend pour les e-mails de connexion.

## Prérequis

- Node.js 20 ou plus récent ;
- pnpm ;
- une base PostgreSQL Neon ;
- un compte Resend pour activer la connexion par e-mail.

## Installation

```bash
git clone <url-du-fork>
cd keep
pnpm install
cp .env.example .env
```

Complétez ensuite les variables obligatoires dans `.env`, puis démarrez le
projet :

```bash
pnpm dev
```

L’application est disponible par défaut sur
[`http://localhost:3000`](http://localhost:3000).

Les tables PostgreSQL sont créées ou mises à niveau automatiquement au
démarrage.

## Variables d’environnement

| Variable | Requise | Description |
| --- | --- | --- |
| `RUN_DATABASE_URL` | Oui | URL de connexion PostgreSQL/Neon. |
| `RUN_LOGIN_EMAIL_FROM` | Oui | Expéditeur vérifié utilisé par Resend. |
| `RUN_AUTH_SECRET` | Pour la connexion | Secret long utilisé pour signer les codes. |
| `RUN_RESEND_API_KEY` | Pour la connexion | Clé API Resend. |
| `RUN_PUBLIC_APP_URL` | Recommandée | URL publique utilisée notamment pour le logo des e-mails. |
| `RUN_PUBLIC_APP_NAME` | Non | Nom public de l’application, `Keep` par défaut. |
| `RUN_LOGIN_CODE_SUBJECT` | Non | Objet de l’e-mail de connexion. |
| `RUN_LOGIN_CODE_EXPIRES_MINUTES` | Non | Durée de validité du code, 10 minutes par défaut. |
| `RUN_LOGIN_CODE_TEMPLATE` | Non | Chemin vers le template HTML de l’e-mail. |
| `RUN_API_ONLY` | Non | Active le serveur API sans le frontend. |
| `RUN_PORT` ou `PORT` | Non | Port HTTP, `3000` par défaut. |

Consultez [`.env.example`](./.env.example) pour un exemple complet. Les
variables commençant par `RUN_PUBLIC_` sont accessibles dans le navigateur et
ne doivent jamais contenir de secret.

## Commandes

```bash
# Application complète en développement
pnpm dev

# API seule en développement
pnpm dev:api

# API seule sans mode watch
pnpm start:api

# Générer les fichiers Runable
pnpm app:prepare

# Vérifier les types du frontend
pnpm typecheck

# Vérifier les types du backend
pnpm typecheck:server

# Construire le client et le serveur SSR
pnpm app:build
```

## Utiliser uniquement l’API

```bash
pnpm start:api
```

Dans ce mode, les routes `/api/*` sont disponibles mais aucune page Vue n’est
servie. Le contrôle de santé est accessible avec :

```bash
curl http://localhost:3000/api/health
```

Principales routes :

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/api/health` | État du serveur. |
| `GET`, `PUT` | `/api/state` | Lecture et synchronisation d’une session. |
| `GET` | `/api/state/events` | Flux temps réel SSE. |
| `POST` | `/api/state/merge` | Fusion de deux sessions. |
| `POST` | `/api/auth/request-code` | Envoi du code de connexion. |
| `POST` | `/api/auth/verify-code` | Validation du code. |
| `GET`, `PATCH` | `/api/auth/me` | Lecture et modification du profil. |
| `POST` | `/api/auth/logout` | Déconnexion. |

## Étendre le frontend

Ajoutez un plugin dans `app/plugins/` et inscrivez vos handlers avec
`keepHooks` :

```ts
import { keepHooks } from "@/extensions";

export default defineVuePlugin({
  name: "my-feature",
  setup() {
    keepHooks.onBeforeNoteSave((context) => {
      context.input.title ||= "Sans titre";
    });

    keepHooks.onLogin(({ user }) => {
      console.info("Connexion de", user.email);
    });
  },
});
```

Les hooks `before` peuvent transformer les données ou annuler l’opération avec
`context.cancel()`. Consultez [EXTENSIONS.md](./EXTENSIONS.md) pour la liste
complète.

## Étendre le backend

Ajoutez un fichier dans `server/plugins/`. Il est découvert automatiquement et
peut enregistrer des hooks, créer des tables ou exposer de nouvelles routes :

```ts
import { defineBackendPlugin } from "../extensions/index.js";

export default defineBackendPlugin({
  name: "my-api-feature",
  setup({ app, hooks }) {
    app.get("/api/my-feature", async () => ({ enabled: true }));

    hooks.onBeforeNoteSave(({ note, cancel }) => {
      if (!note.title.trim()) cancel("Un titre est obligatoire");
    });
  },
});
```

Les hooks backend sont asynchrones et sont exécutés avant la poursuite de la
requête. Consultez [BACKEND_EXTENSIONS.md](./BACKEND_EXTENSIONS.md).

## Structure

```text
app/
├── components/      composants applicatifs et shadcn-vue
├── extensions/      API des hooks frontend
├── layouts/         layouts Runable
├── pages/           routes Vue
├── plugins/         extensions frontend d’un fork
└── stores/          stores Pinia

server/
├── email-templates/ templates d’e-mail
├── extensions/      API et chargeur des plugins backend
└── plugins/         extensions backend auto-chargées

server.ts            API Fastify et démarrage du serveur
runable.config.ts    configuration Runable
```

## Sécurité

- Ne commitez jamais le fichier `.env`.
- Utilisez un secret d’authentification long et aléatoire.
- Vérifiez le domaine expéditeur dans Resend.
- Les sessions anonymes sont accessibles à toute personne possédant leur lien
  ou leur identifiant : traitez-les comme des informations confidentielles.

## Licence

Aucune licence n’est actuellement définie dans ce dépôt. Ajoutez un fichier
`LICENSE` avant toute distribution publique afin d’indiquer clairement les
droits accordés aux utilisateurs et aux contributeurs.
