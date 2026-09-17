import type {
  Category,
  CreateNoteInput,
  Folder,
  Note,
  User,
} from "../stores/notes";

export interface CancelableHookContext {
  readonly canceled: boolean;
  readonly cancelReason?: string;
  cancel(reason?: string): void;
}

export interface KeepHookMap {
  beforeNoteSave: CancelableHookContext & {
    input: CreateNoteInput;
    noteId?: string;
    existingNote?: Note;
  };
  afterNoteSave: {
    note: Note;
    operation: "create" | "update";
  };
  beforeNoteDelete: CancelableHookContext & { note: Note };
  afterNoteDelete: { note: Note };
  beforeFolderCreate: CancelableHookContext & {
    name: string;
    parentId: string | null;
  };
  afterFolderCreate: { folder: Folder };
  beforeFolderRename: CancelableHookContext & {
    folder: Folder;
    name: string;
  };
  afterFolderRename: { folder: Folder; previousName: string };
  beforeFolderDelete: CancelableHookContext & { folder: Folder };
  afterFolderDelete: { folders: Folder[]; unfiledNoteIds: string[] };
  beforeCategoryCreate: CancelableHookContext & {
    name: string;
    color: string;
    folderId: string | null;
  };
  afterCategoryCreate: { category: Category };
  beforeCategoryUpdate: CancelableHookContext & {
    category: Category;
    name: string;
    color: string;
    folderId: string | null;
  };
  afterCategoryUpdate: {
    category: Category;
    previousName: string;
    previousColor: string;
    previousFolderId: string | null;
  };
  beforeCategoryDelete: CancelableHookContext & { category: Category };
  afterCategoryDelete: { category: Category };
  beforeLogin: CancelableHookContext & { email: string; sessionId: string };
  login: { user: User; sessionId: string };
  logout: { user: User | null; sessionId: string };
  beforeProfileUpdate: CancelableHookContext & {
    name: string;
    avatar: string | null;
  };
  afterProfileUpdate: { user: User; previousUser: User | null };
  beforeSessionMerge: CancelableHookContext & {
    sourceSessionId: string;
    targetSessionId: string;
  };
  afterSessionMerge: {
    sourceSessionId: string;
    targetSessionId: string;
    notes: Note[];
    folders: Folder[];
    categories: Category[];
  };
}

export type KeepHookName = keyof KeepHookMap;
export type KeepHookHandler<Name extends KeepHookName> = (
  context: KeepHookMap[Name],
) => void | Promise<void>;

type AnyHookHandler = KeepHookHandler<KeepHookName>;

function reportHookError(name: KeepHookName, error: unknown) {
  console.error(`[keep:hook:${name}]`, error);
}

class KeepHooks {
  private readonly handlers = new Map<KeepHookName, Set<AnyHookHandler>>();

  on<Name extends KeepHookName>(
    name: Name,
    handler: KeepHookHandler<Name>,
  ) {
    const handlers = this.handlers.get(name) ?? new Set<AnyHookHandler>();
    handlers.add(handler as AnyHookHandler);
    this.handlers.set(name, handlers);

    return () => handlers.delete(handler as AnyHookHandler);
  }

  emit<Name extends KeepHookName>(name: Name, context: KeepHookMap[Name]) {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        const result = handler(context);
        if (result instanceof Promise) {
          void result.catch((error) => reportHookError(name, error));
        }
      } catch (error) {
        reportHookError(name, error);
      }
    }
  }

  onBeforeNoteSave(handler: KeepHookHandler<"beforeNoteSave">) {
    return this.on("beforeNoteSave", handler);
  }

  onAfterNoteSave(handler: KeepHookHandler<"afterNoteSave">) {
    return this.on("afterNoteSave", handler);
  }

  onBeforeNoteDelete(handler: KeepHookHandler<"beforeNoteDelete">) {
    return this.on("beforeNoteDelete", handler);
  }

  onAfterNoteDelete(handler: KeepHookHandler<"afterNoteDelete">) {
    return this.on("afterNoteDelete", handler);
  }

  onBeforeFolderCreate(handler: KeepHookHandler<"beforeFolderCreate">) {
    return this.on("beforeFolderCreate", handler);
  }

  onAfterFolderCreate(handler: KeepHookHandler<"afterFolderCreate">) {
    return this.on("afterFolderCreate", handler);
  }

  onBeforeFolderRename(handler: KeepHookHandler<"beforeFolderRename">) {
    return this.on("beforeFolderRename", handler);
  }

  onAfterFolderRename(handler: KeepHookHandler<"afterFolderRename">) {
    return this.on("afterFolderRename", handler);
  }

  onBeforeFolderDelete(handler: KeepHookHandler<"beforeFolderDelete">) {
    return this.on("beforeFolderDelete", handler);
  }

  onAfterFolderDelete(handler: KeepHookHandler<"afterFolderDelete">) {
    return this.on("afterFolderDelete", handler);
  }

  onBeforeCategoryCreate(handler: KeepHookHandler<"beforeCategoryCreate">) {
    return this.on("beforeCategoryCreate", handler);
  }

  onAfterCategoryCreate(handler: KeepHookHandler<"afterCategoryCreate">) {
    return this.on("afterCategoryCreate", handler);
  }

  onBeforeCategoryUpdate(handler: KeepHookHandler<"beforeCategoryUpdate">) {
    return this.on("beforeCategoryUpdate", handler);
  }

  onAfterCategoryUpdate(handler: KeepHookHandler<"afterCategoryUpdate">) {
    return this.on("afterCategoryUpdate", handler);
  }

  onBeforeCategoryDelete(handler: KeepHookHandler<"beforeCategoryDelete">) {
    return this.on("beforeCategoryDelete", handler);
  }

  onAfterCategoryDelete(handler: KeepHookHandler<"afterCategoryDelete">) {
    return this.on("afterCategoryDelete", handler);
  }

  onLogin(handler: KeepHookHandler<"login">) {
    return this.on("login", handler);
  }

  onBeforeLogin(handler: KeepHookHandler<"beforeLogin">) {
    return this.on("beforeLogin", handler);
  }

  onLogout(handler: KeepHookHandler<"logout">) {
    return this.on("logout", handler);
  }

  onBeforeProfileUpdate(handler: KeepHookHandler<"beforeProfileUpdate">) {
    return this.on("beforeProfileUpdate", handler);
  }

  onAfterProfileUpdate(handler: KeepHookHandler<"afterProfileUpdate">) {
    return this.on("afterProfileUpdate", handler);
  }

  onBeforeSessionMerge(handler: KeepHookHandler<"beforeSessionMerge">) {
    return this.on("beforeSessionMerge", handler);
  }

  onAfterSessionMerge(handler: KeepHookHandler<"afterSessionMerge">) {
    return this.on("afterSessionMerge", handler);
  }
}

export function createCancelableHookContext(): CancelableHookContext {
  let canceled = false;
  let cancelReason: string | undefined;

  return {
    get canceled() {
      return canceled;
    },
    get cancelReason() {
      return cancelReason;
    },
    cancel(reason?: string) {
      canceled = true;
      cancelReason = reason;
    },
  };
}

export const keepHooks = new KeepHooks();
