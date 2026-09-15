interface BaseNote {
  id: string;
  title: string;
  createdAt: string;
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
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

interface CreateNoteInput {
  title?: string;
  contentHtml: string;
  contentText: string;
  folderId?: string | null;
}

interface RemoteState {
  exists: boolean;
  revision: number;
  notes: Note[];
  folders: Folder[];
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let stateEvents: EventSource | undefined;
let lastRevision = 0;

function browserSessionId() {
  const storageKey = "keep-session-id";
  const storedId = localStorage.getItem(storageKey);
  if (storedId) return storedId;

  const sessionId = crypto.randomUUID();
  localStorage.setItem(storageKey, sessionId);
  return sessionId;
}

export const useNotesStore = defineStore("notes", {
  state: () => ({
    notes: [] as Note[],
    folders: [] as Folder[],
    sessionId: "",
    syncStatus: "idle" as "idle" | "syncing" | "synced" | "error",
    syncError: "",
  }),

  actions: {
    saveNote(input: CreateNoteInput, noteId?: string) {
      const title = input.title?.trim() ?? "";
      const contentText = input.contentText.trim();

      if (!title && !contentText) {
        return noteId;
      }

      if (noteId) {
        const note = this.notes.find((item) => item.id === noteId);

        if (note) {
          note.title = title;
          Object.assign(note, {
            format: "rich-text" as const,
            contentHtml: input.contentHtml,
            contentText,
            folderId: input.folderId ?? null,
          });
          this.scheduleSync();
          return noteId;
        }
      }

      const id = crypto.randomUUID();

      this.notes.unshift({
        id,
        title,
        format: "rich-text",
        contentHtml: input.contentHtml,
        contentText,
        folderId: input.folderId ?? null,
        createdAt: new Date().toISOString(),
      });

      this.scheduleSync();

      return id;
    },

    deleteNote(noteId: string) {
      const index = this.notes.findIndex((note) => note.id === noteId);

      if (index !== -1) {
        this.notes.splice(index, 1);
        this.scheduleSync();
      }
    },

    addFolder(name: string, parentId: string | null = null) {
      const normalizedName = name.trim();
      if (!normalizedName) return;

      const validParentId = this.folders.some((folder) => folder.id === parentId)
        ? parentId
        : null;
      const id = crypto.randomUUID();

      this.folders.push({
        id,
        name: normalizedName,
        parentId: validParentId,
        createdAt: new Date().toISOString(),
      });

      this.scheduleSync();

      return id;
    },

    renameFolder(folderId: string, name: string) {
      const normalizedName = name.trim();
      if (!normalizedName) return false;

      const folder = this.folders.find((item) => item.id === folderId);
      if (!folder) return false;

      folder.name = normalizedName;
      this.scheduleSync();
      return true;
    },

    deleteFolder(folderId: string) {
      if (!this.folders.some((folder) => folder.id === folderId)) return [];

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

      for (const note of this.notes) {
        if (note.folderId && deletedFolderIds.has(note.folderId)) {
          note.folderId = null;
        }
      }

      this.folders = this.folders.filter(
        (folder) => !deletedFolderIds.has(folder.id),
      );

      this.scheduleSync();

      return [...deletedFolderIds];
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
            body: JSON.stringify({ notes: this.notes, folders: this.folders }),
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
          this.syncStatus = "synced";
        } else if (this.notes.length || this.folders.length) {
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
  },

  persist: true,
});
