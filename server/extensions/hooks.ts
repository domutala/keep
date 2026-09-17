export interface BackendStoredFolder {
  id: string;
  name: string;
  parentId: string | null;
  categoryId?: string | null;
  createdAt: string;
}

export interface BackendStoredNote {
  id: string;
  title: string;
  createdAt: string;
  folderId?: string | null;
  categoryId?: string | null;
  format?: "rich-text";
  content?: string;
  contentHtml?: string;
  contentText?: string;
}

export interface BackendStoredCategory {
  id: string;
  name: string;
  color: string;
  folderId?: string | null;
  createdAt: string;
}

export interface BackendStoredState {
  folders: BackendStoredFolder[];
  notes: BackendStoredNote[];
  categories: BackendStoredCategory[];
}

export interface BackendUser {
  email: string;
  name: string;
  avatar: string | null;
}

export interface BackendCancelableContext {
  readonly canceled: boolean;
  readonly cancelReason?: string;
  cancel(reason?: string): void;
}

export interface BackendHookMap {
  beforeNoteSave: BackendCancelableContext & {
    sessionId: string;
    note: BackendStoredNote;
    previousNote?: BackendStoredNote;
  };
  afterNoteSave: {
    sessionId: string;
    note: BackendStoredNote;
    operation: "create" | "update";
  };
  beforeStateSave: BackendCancelableContext & {
    sessionId: string;
    state: BackendStoredState;
    previousState: BackendStoredState;
  };
  afterStateSave: {
    sessionId: string;
    state: BackendStoredState;
    revision: number;
  };
  beforeLogin: BackendCancelableContext & {
    email: string;
    sessionId: string;
  };
  afterLogin: {
    user: BackendUser;
    sessionId: string;
  };
  afterLogout: { userId?: string };
  beforeProfileUpdate: BackendCancelableContext & {
    name: string;
    avatar: string | null;
  };
  afterProfileUpdate: { user: BackendUser };
  beforeSessionMerge: BackendCancelableContext & {
    targetSessionId: string;
    sourceSessionId: string;
  };
  afterSessionMerge: {
    targetSessionId: string;
    sourceSessionId: string;
    state: BackendStoredState;
  };
}

export type BackendHookName = keyof BackendHookMap;
export type BackendHookHandler<Name extends BackendHookName> = (
  context: BackendHookMap[Name],
) => void | Promise<void>;

type AnyBackendHookHandler = BackendHookHandler<BackendHookName>;

export class BackendHooks {
  private readonly handlers = new Map<
    BackendHookName,
    Set<AnyBackendHookHandler>
  >();

  on<Name extends BackendHookName>(
    name: Name,
    handler: BackendHookHandler<Name>,
  ) {
    const handlers =
      this.handlers.get(name) ?? new Set<AnyBackendHookHandler>();
    handlers.add(handler as AnyBackendHookHandler);
    this.handlers.set(name, handlers);
    return () => handlers.delete(handler as AnyBackendHookHandler);
  }

  async emit<Name extends BackendHookName>(
    name: Name,
    context: BackendHookMap[Name],
  ) {
    for (const handler of this.handlers.get(name) ?? []) {
      await handler(context);
    }
  }

  has(name: BackendHookName) {
    return Boolean(this.handlers.get(name)?.size);
  }

  onBeforeNoteSave(handler: BackendHookHandler<"beforeNoteSave">) {
    return this.on("beforeNoteSave", handler);
  }

  onAfterNoteSave(handler: BackendHookHandler<"afterNoteSave">) {
    return this.on("afterNoteSave", handler);
  }

  onBeforeStateSave(handler: BackendHookHandler<"beforeStateSave">) {
    return this.on("beforeStateSave", handler);
  }

  onAfterStateSave(handler: BackendHookHandler<"afterStateSave">) {
    return this.on("afterStateSave", handler);
  }

  onBeforeLogin(handler: BackendHookHandler<"beforeLogin">) {
    return this.on("beforeLogin", handler);
  }

  onAfterLogin(handler: BackendHookHandler<"afterLogin">) {
    return this.on("afterLogin", handler);
  }

  onAfterLogout(handler: BackendHookHandler<"afterLogout">) {
    return this.on("afterLogout", handler);
  }

  onBeforeProfileUpdate(handler: BackendHookHandler<"beforeProfileUpdate">) {
    return this.on("beforeProfileUpdate", handler);
  }

  onAfterProfileUpdate(handler: BackendHookHandler<"afterProfileUpdate">) {
    return this.on("afterProfileUpdate", handler);
  }

  onBeforeSessionMerge(handler: BackendHookHandler<"beforeSessionMerge">) {
    return this.on("beforeSessionMerge", handler);
  }

  onAfterSessionMerge(handler: BackendHookHandler<"afterSessionMerge">) {
    return this.on("afterSessionMerge", handler);
  }
}

export function createBackendCancelableContext(): BackendCancelableContext {
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

export const backendHooks = new BackendHooks();
