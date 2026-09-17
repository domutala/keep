# Étendre Keep

Keep expose des hooks typés pour ajouter des fonctionnalités sans modifier le
store ou les composants principaux. Créez simplement un plugin dans
`app/plugins/`.

Pour les extensions côté API, consultez
[`BACKEND_EXTENSIONS.md`](./BACKEND_EXTENSIONS.md).

## Exemple

```ts
// app/plugins/my-feature.ts
import { keepHooks } from "@/extensions";

export default defineVuePlugin({
  name: "my-feature",
  setup() {
    keepHooks.onBeforeNoteSave((context) => {
      // Les contextes `before` peuvent modifier les données.
      context.input.title ||= "Sans titre";

      // Ils peuvent aussi annuler l'opération.
      if (context.input.contentText.length > 50_000) {
        context.cancel("Cette note est trop longue.");
      }
    });

    keepHooks.onAfterNoteSave(({ note, operation }) => {
      console.info(`Note ${operation}:`, note.id);
    });

    keepHooks.onLogin(({ user }) => {
      console.info(`${user.email} vient de se connecter`);
    });
  },
});
```

Les méthodes d'inscription retournent une fonction qui désinscrit le handler :

```ts
const unsubscribe = keepHooks.onAfterNoteDelete(({ note }) => {
  console.info(note.id);
});

unsubscribe();
```

## Hooks disponibles

- `onBeforeNoteSave` / `onAfterNoteSave`
- `onBeforeNoteDelete` / `onAfterNoteDelete`
- `onBeforeFolderCreate` / `onAfterFolderCreate`
- `onBeforeFolderRename` / `onAfterFolderRename`
- `onBeforeFolderDelete` / `onAfterFolderDelete`
- `onBeforeLogin` / `onLogin` / `onLogout`
- `onBeforeProfileUpdate` / `onAfterProfileUpdate`
- `onBeforeSessionMerge` / `onAfterSessionMerge`

Tous les événements sont également accessibles avec l'API générique :

```ts
keepHooks.on("afterNoteSave", ({ note }) => {
  // ...
});
```

Les hooks `before` sont synchrones pour garantir que l'annulation et les
transformations ont lieu avant la mutation du store. Les hooks `after` peuvent
retourner une promesse. Une erreur dans une extension est journalisée sans
interrompre le fonctionnement principal de Keep.
