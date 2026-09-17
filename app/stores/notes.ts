import { createCancelableHookContext, keepHooks } from "../extensions";

interface BaseNote {
  id: string;
  title: string;
  createdAt: string;
  folderId?: string | null;
  categoryId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  categoryId?: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  folderId?: string | null;
  createdAt: string;
}

export const CATEGORY_COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#94a3b8",
];

export interface User {
  email: string;
  name: string;
  avatar: string | null;
}

export interface RichTextNote extends BaseNote {
  format: "rich-text";
  contentHtml: string;
  contentText: string;
}

export interface LegacyNote extends BaseNote {
  format?: never;
  content: string;
}

export type Note = RichTextNote | LegacyNote;

export interface CreateNoteInput {
  title?: string;
  contentHtml: string;
  contentText: string;
  folderId?: string | null;
  categoryId?: string | null;
}

interface RemoteState {
  exists: boolean;
  revision: number;
  notes: Note[];
  folders: Folder[];
  categories: Category[];
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let stateEvents: EventSource | undefined;
let lastRevision = 0;
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function browserSessionId() {
  const storageKey = "keep-session-id";
  const sharedId = new URL(window.location.href).searchParams.get("session");
  if (sharedId && sessionIdPattern.test(sharedId)) {
    localStorage.setItem(storageKey, sharedId);
    return sharedId;
  }

  const storedId = localStorage.getItem(storageKey);
  if (storedId && sessionIdPattern.test(storedId)) return storedId;

  const sessionId = crypto.randomUUID();
  localStorage.setItem(storageKey, sessionId);
  return sessionId;
}

export const useNotesStore = defineStore("notes", {
  state: () => ({
    notes: [] as Note[],
    folders: [] as Folder[],
    categories: [] as Category[],
    sessionId: "",
    currentUser: null as User | null,
    syncStatus: "idle" as "idle" | "syncing" | "synced" | "error",
    syncError: "",
  }),

  actions: {
    async loadCurrentUser() {
      if (typeof window === "undefined") return;
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) return;
        const result = (await response.json()) as {
          user: User | null;
        };
        this.currentUser = result.user;
      } catch {
        this.currentUser = null;
      }
    },

    async requestLoginCode(email: string) {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Patientez une minute avant de demander un nouveau code.");
        }
        if (response.status === 503) {
          throw new Error("L’envoi d’emails n’est pas encore configuré.");
        }
        throw new Error("Impossible d’envoyer le code de connexion.");
      }
    },

    async verifyLoginCode(email: string, code: string) {
      if (typeof window === "undefined") return;
      this.sessionId ||= browserSessionId();
      const hookContext = Object.assign(createCancelableHookContext(), {
        email,
        sessionId: this.sessionId,
      });
      keepHooks.emit("beforeLogin", hookContext);
      if (hookContext.canceled) {
        throw new Error(hookContext.cancelReason ?? "La connexion a été annulée.");
      }

      await this.syncToDatabase();

      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: hookContext.email,
          code,
          sessionId: hookContext.sessionId,
        }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Le code est incorrect ou a expiré.");
        }
        throw new Error("La connexion a échoué.");
      }

      const result = (await response.json()) as {
        user: User;
        sessionId: string;
      };
      this.currentUser = result.user;
      this.sessionId = result.sessionId;
      localStorage.setItem("keep-session-id", result.sessionId);

      const url = new URL(window.location.href);
      url.searchParams.set("session", result.sessionId);
      window.history.replaceState(window.history.state, "", url);
      stateEvents?.close();
      await this.initializeSync();
      keepHooks.emit("login", {
        user: result.user,
        sessionId: result.sessionId,
      });
      return result.user;
    },

    async logout() {
      const previousUser = this.currentUser;
      const previousSessionId = this.sessionId;
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("La déconnexion a échoué.");

      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = undefined;
      }
      stateEvents?.close();
      stateEvents = undefined;
      lastRevision = 0;

      if (typeof window !== "undefined") {
        localStorage.removeItem("keep-session-id");
        const url = new URL(window.location.href);
        url.searchParams.delete("session");
        window.history.replaceState(window.history.state, "", url);
      }

      this.$reset();

      if (typeof window !== "undefined") {
        await this.initializeSync();
      }

      keepHooks.emit("logout", {
        user: previousUser,
        sessionId: previousSessionId,
      });
    },

    async updateProfile(name: string, avatar: string | null) {
      const hookContext = Object.assign(createCancelableHookContext(), {
        name,
        avatar,
      });
      keepHooks.emit("beforeProfileUpdate", hookContext);
      if (hookContext.canceled) {
        throw new Error(hookContext.cancelReason ?? "La modification du profil a été annulée.");
      }

      const previousUser = this.currentUser ? { ...this.currentUser } : null;
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hookContext.name,
          avatar: hookContext.avatar,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.currentUser = null;
          throw new Error("Votre session de connexion a expiré.");
        }
        throw new Error("Impossible d’enregistrer le profil.");
      }

      const result = (await response.json()) as { user: User };
      this.currentUser = result.user;
      keepHooks.emit("afterProfileUpdate", {
        user: result.user,
        previousUser,
      });
      return result.user;
    },

    sessionShareUrl() {
      if (typeof window === "undefined") return "";
      this.sessionId ||= browserSessionId();

      const url = new URL(window.location.href);
      url.searchParams.set("session", this.sessionId);
      return url.toString();
    },

    saveNote(input: CreateNoteInput, noteId?: string) {
      const existingNote = noteId
        ? this.notes.find((item) => item.id === noteId)
        : undefined;
      const hookContext = Object.assign(createCancelableHookContext(), {
        input: { ...input },
        noteId,
        existingNote,
      });
      keepHooks.emit("beforeNoteSave", hookContext);
      if (hookContext.canceled) return noteId;

      const title = hookContext.input.title?.trim() ?? "";
      const contentText = hookContext.input.contentText.trim();

      if (!title && !contentText) {
        return noteId;
      }

      if (noteId) {
        const note = this.notes.find((item) => item.id === noteId);

        if (note) {
          note.title = title;
          Object.assign(note, {
            format: "rich-text" as const,
            contentHtml: hookContext.input.contentHtml,
            contentText,
            folderId: hookContext.input.folderId ?? null,
            categoryId: hookContext.input.categoryId ?? null,
          });
          this.scheduleSync();
          keepHooks.emit("afterNoteSave", {
            note,
            operation: "update",
          });
          return noteId;
        }
      }

      const id = crypto.randomUUID();

      const note: RichTextNote = {
        id,
        title,
        format: "rich-text",
        contentHtml: hookContext.input.contentHtml,
        contentText,
        folderId: hookContext.input.folderId ?? null,
        categoryId: hookContext.input.categoryId ?? null,
        createdAt: new Date().toISOString(),
      };
      this.notes.unshift(note);

      this.scheduleSync();
      keepHooks.emit("afterNoteSave", { note, operation: "create" });

      return id;
    },

    deleteNote(noteId: string) {
      const index = this.notes.findIndex((note) => note.id === noteId);

      if (index !== -1) {
        const note = this.notes[index]!;
        const hookContext = Object.assign(createCancelableHookContext(), {
          note,
        });
        keepHooks.emit("beforeNoteDelete", hookContext);
        if (hookContext.canceled) return false;

        this.notes.splice(index, 1);
        this.scheduleSync();
        keepHooks.emit("afterNoteDelete", { note });
        return true;
      }

      return false;
    },

    addFolder(
      name: string,
      parentId: string | null = null,
      categoryId: string | null = null,
    ) {
      const hookContext = Object.assign(createCancelableHookContext(), {
        name,
        parentId,
      });
      keepHooks.emit("beforeFolderCreate", hookContext);
      if (hookContext.canceled) return;

      const normalizedName = hookContext.name.trim();
      if (!normalizedName) return;

      const validParentId = this.folders.some(
        (folder) => folder.id === hookContext.parentId,
      )
        ? hookContext.parentId
        : null;
      const validCategoryId = this.categories.some(
        (category) => category.id === categoryId,
      )
        ? categoryId
        : null;
      const id = crypto.randomUUID();

      const folder: Folder = {
        id,
        name: normalizedName,
        parentId: validParentId,
        categoryId: validCategoryId,
        createdAt: new Date().toISOString(),
      };
      this.folders.push(folder);

      this.scheduleSync();
      keepHooks.emit("afterFolderCreate", { folder });

      return id;
    },

    setFolderCategory(folderId: string, categoryId: string | null) {
      const folder = this.folders.find((item) => item.id === folderId);
      if (!folder) return false;

      const validCategoryId = this.categories.some(
        (category) => category.id === categoryId,
      )
        ? categoryId
        : null;

      folder.categoryId = validCategoryId;
      this.scheduleSync();
      return true;
    },

    renameFolder(folderId: string, name: string) {
      const folder = this.folders.find((item) => item.id === folderId);
      if (!folder) return false;

      const hookContext = Object.assign(createCancelableHookContext(), {
        folder,
        name,
      });
      keepHooks.emit("beforeFolderRename", hookContext);
      if (hookContext.canceled) return false;

      const normalizedName = hookContext.name.trim();
      if (!normalizedName) return false;
      const previousName = folder.name;
      folder.name = normalizedName;
      this.scheduleSync();
      keepHooks.emit("afterFolderRename", { folder, previousName });
      return true;
    },

    deleteFolder(folderId: string) {
      const rootFolder = this.folders.find((folder) => folder.id === folderId);
      if (!rootFolder) return [];

      const hookContext = Object.assign(createCancelableHookContext(), {
        folder: rootFolder,
      });
      keepHooks.emit("beforeFolderDelete", hookContext);
      if (hookContext.canceled) return [];

      const deletedFolderIds = new Set([folderId]);
      let foundChild = true;

      while (foundChild) {
        foundChild = false;

        for (const folder of this.folders) {
          if (
            folder.parentId &&
            deletedFolderIds.has(folder.parentId) &&
            !deletedFolderIds.has(folder.id)
          ) {
            deletedFolderIds.add(folder.id);
            foundChild = true;
          }
        }
      }

      const deletedFolders = this.folders.filter((folder) =>
        deletedFolderIds.has(folder.id),
      );
      const unfiledNoteIds: string[] = [];
      for (const note of this.notes) {
        if (note.folderId && deletedFolderIds.has(note.folderId)) {
          note.folderId = null;
          unfiledNoteIds.push(note.id);
        }
      }
      for (const category of this.categories) {
        if (category.folderId && deletedFolderIds.has(category.folderId)) {
          category.folderId = null;
        }
      }

      this.folders = this.folders.filter(
        (folder) => !deletedFolderIds.has(folder.id),
      );

      this.scheduleSync();
      keepHooks.emit("afterFolderDelete", {
        folders: deletedFolders,
        unfiledNoteIds,
      });

      return [...deletedFolderIds];
    },

    addCategory(name: string, color: string, folderId: string | null = null) {
      const hookContext = Object.assign(createCancelableHookContext(), {
        name,
        color,
        folderId,
      });
      keepHooks.emit("beforeCategoryCreate", hookContext);
      if (hookContext.canceled) return;

      const normalizedName = hookContext.name.trim();
      if (!normalizedName) return;

      const id = crypto.randomUUID();
      const validFolderId = this.folders.some(
        (folder) => folder.id === hookContext.folderId,
      )
        ? hookContext.folderId
        : null;
      const category: Category = {
        id,
        name: normalizedName,
        color: hookContext.color,
        folderId: validFolderId,
        createdAt: new Date().toISOString(),
      };
      this.categories.push(category);

      this.scheduleSync();
      keepHooks.emit("afterCategoryCreate", { category });

      return id;
    },

    updateCategory(
      categoryId: string,
      name: string,
      color: string,
      folderId: string | null = null,
    ) {
      const category = this.categories.find((item) => item.id === categoryId);
      if (!category) return false;

      const hookContext = Object.assign(createCancelableHookContext(), {
        category,
        name,
        color,
        folderId,
      });
      keepHooks.emit("beforeCategoryUpdate", hookContext);
      if (hookContext.canceled) return false;

      const normalizedName = hookContext.name.trim();
      if (!normalizedName) return false;

      const previousName = category.name;
      const previousColor = category.color;
      const previousFolderId = category.folderId ?? null;
      const validFolderId = this.folders.some(
        (folder) => folder.id === hookContext.folderId,
      )
        ? hookContext.folderId
        : null;
      category.name = normalizedName;
      category.color = hookContext.color;
      category.folderId = validFolderId;

      this.scheduleSync();
      keepHooks.emit("afterCategoryUpdate", {
        category,
        previousName,
        previousColor,
        previousFolderId,
      });
      return true;
    },

    deleteCategory(categoryId: string) {
      const category = this.categories.find((item) => item.id === categoryId);
      if (!category) return false;

      const hookContext = Object.assign(createCancelableHookContext(), {
        category,
      });
      keepHooks.emit("beforeCategoryDelete", hookContext);
      if (hookContext.canceled) return false;

      for (const note of this.notes) {
        if (note.categoryId === categoryId) note.categoryId = null;
      }
      for (const folder of this.folders) {
        if (folder.categoryId === categoryId) folder.categoryId = null;
      }
      this.categories = this.categories.filter(
        (item) => item.id !== categoryId,
      );

      this.scheduleSync();
      keepHooks.emit("afterCategoryDelete", { category });
      return true;
    },

    scheduleSync() {
      if (typeof window === "undefined") return;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => void this.syncToDatabase(), 350);
    },

    async syncToDatabase() {
      if (typeof window === "undefined") return;
      this.sessionId ||= browserSessionId();
      this.syncStatus = "syncing";
      this.syncError = "";

      try {
        const response = await fetch(
          `/api/state?sessionId=${encodeURIComponent(this.sessionId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notes: this.notes,
              folders: this.folders,
              categories: this.categories,
            }),
          },
        );
        if (!response.ok) throw new Error(`Sync failed (${response.status})`);

        const result = (await response.json()) as { revision: number };
        lastRevision = Math.max(lastRevision, result.revision);
        this.syncStatus = "synced";
      } catch (error) {
        this.syncStatus = "error";
        this.syncError =
          error instanceof Error ? error.message : "Database sync failed";
      }
    },

    async initializeSync() {
      if (typeof window === "undefined") return;
      this.sessionId = browserSessionId();
      this.syncStatus = "syncing";
      this.syncError = "";

      try {
        const response = await fetch(
          `/api/state?sessionId=${encodeURIComponent(this.sessionId)}`,
        );
        if (!response.ok) throw new Error(`Loading failed (${response.status})`);

        const remote = (await response.json()) as RemoteState;
        lastRevision = remote.revision;

        if (remote.exists) {
          this.notes = remote.notes;
          this.folders = remote.folders;
          this.categories = remote.categories ?? [];
          this.syncStatus = "synced";
        } else if (
          this.notes.length ||
          this.folders.length ||
          this.categories.length
        ) {
          await this.syncToDatabase();
        } else {
          this.syncStatus = "synced";
        }

        stateEvents?.close();
        stateEvents = new EventSource(
          `/api/state/events?sessionId=${encodeURIComponent(this.sessionId)}`,
        );
        stateEvents.addEventListener("state", (event) => {
          const state = JSON.parse((event as MessageEvent<string>).data) as RemoteState;
          if (state.revision <= lastRevision) return;

          lastRevision = state.revision;
          this.notes = state.notes;
          this.folders = state.folders;
          this.categories = state.categories ?? [];
          this.syncStatus = "synced";
        });
        stateEvents.onerror = () => {
          this.syncStatus = "error";
          this.syncError = "Realtime connection interrupted";
        };
      } catch (error) {
        this.syncStatus = "error";
        this.syncError =
          error instanceof Error ? error.message : "Database loading failed";
      }
    },

    async mergeSession(sourceSessionId: string) {
      if (typeof window === "undefined") return;
      const normalizedId = sourceSessionId.trim();
      this.sessionId ||= browserSessionId();

      if (!sessionIdPattern.test(normalizedId)) {
        throw new Error("L’identifiant de session est invalide.");
      }
      if (normalizedId === this.sessionId) {
        throw new Error("Cette session est déjà la session courante.");
      }

      const hookContext = Object.assign(createCancelableHookContext(), {
        sourceSessionId: normalizedId,
        targetSessionId: this.sessionId,
      });
      keepHooks.emit("beforeSessionMerge", hookContext);
      if (hookContext.canceled) {
        throw new Error(hookContext.cancelReason ?? "La fusion a été annulée.");
      }

      await this.syncToDatabase();
      const response = await fetch("/api/state/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetSessionId: hookContext.targetSessionId,
          sourceSessionId: hookContext.sourceSessionId,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("La session à fusionner est introuvable.");
        }
        throw new Error(`La fusion a échoué (${response.status}).`);
      }

      const state = (await response.json()) as RemoteState;
      lastRevision = state.revision;
      this.notes = state.notes;
      this.folders = state.folders;
      this.categories = state.categories ?? [];
      this.syncStatus = "synced";
      keepHooks.emit("afterSessionMerge", {
        sourceSessionId: hookContext.sourceSessionId,
        targetSessionId: hookContext.targetSessionId,
        notes: state.notes,
        folders: state.folders,
        categories: state.categories ?? [],
      });
      return state;
    },
  },

  persist: true,
});
