# Étendre l’API Keep

Le backend Fastify peut fonctionner avec ou sans l’interface Vue.

```bash
# API seule, sans charger Runable ni le front
pnpm dev:api

# Démarrage simple de l’API
pnpm start:api
```

Le port utilise `PORT` ou `RUN_PORT` et vaut `3000` par défaut. Le mode API
seul peut également être activé avec `RUN_API_ONLY=true`.

Les routes existantes restent disponibles sous `/api`, notamment
`GET /api/health`, les routes `/api/auth/*` et `/api/state*`.

## Créer un plugin backend

Ajoutez un fichier dans `server/plugins/`. Il sera chargé automatiquement au
démarrage, avant l’ouverture du port HTTP.

```ts
// server/plugins/audit.ts
import { defineBackendPlugin } from "../extensions/index.js";

export default defineBackendPlugin({
  name: "audit",

  async setup({ app, sql, hooks }) {
    await sql`
      CREATE TABLE IF NOT EXISTS keep_audit (
        id bigserial PRIMARY KEY,
        event text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    hooks.onAfterNoteSave(async ({ sessionId, note, operation }) => {
      await sql`
        INSERT INTO keep_audit (event, payload)
        VALUES (
          ${`note.${operation}`},
          ${JSON.stringify({ sessionId, noteId: note.id })}::jsonb
        )
      `;
    });

    // Un plugin peut aussi exposer ses propres endpoints.
    app.get("/api/audit/health", async () => ({ status: "ok" }));
  },
});
```

Le contexte d’un plugin contient :

- `app` : l’instance Fastify pour ajouter routes, hooks HTTP et décorateurs ;
- `sql` : le client Neon ;
- `hooks` : les événements métier du backend ;
- `apiOnly` : indique si le front est désactivé ;
- `runtime` : la configuration d’environnement Runable.

## Hooks backend

- `onBeforeNoteSave` / `onAfterNoteSave`
- `onBeforeStateSave` / `onAfterStateSave`
- `onBeforeLogin` / `onAfterLogin` / `onAfterLogout`
- `onBeforeProfileUpdate` / `onAfterProfileUpdate`
- `onBeforeSessionMerge` / `onAfterSessionMerge`

Contrairement aux hooks du navigateur, les hooks backend sont asynchrones et
sont attendus avant de poursuivre la requête. Les hooks `before` peuvent
modifier leur contexte ou appeler `context.cancel(reason)`.

Une exception levée par un plugin interrompt la requête et est traitée par le
gestionnaire d’erreurs Fastify. Cela permet notamment d’imposer des règles
métier strictes côté serveur.
