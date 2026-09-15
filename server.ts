import { neon } from "@neondatabase/serverless";
import Fastify from "fastify";
import { fastify } from "runable/adapters/fastify";

try {
  process.loadEnvFile();
} catch {
  // The environment can also be provided by the hosting platform.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = neon(databaseUrl);
const app = Fastify({ bodyLimit: 5 * 1024 * 1024 });

interface StoredFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

interface StoredNote {
  id: string;
  title: string;
  createdAt: string;
  folderId?: string | null;
  format?: "rich-text";
  content?: string;
  contentHtml?: string;
  contentText?: string;
}

interface StoredState {
  folders: StoredFolder[];
  notes: StoredNote[];
}

interface SessionQuery {
  sessionId?: string;
}

interface MergeSessionsBody {
  targetSessionId?: string;
  sourceSessionId?: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

async function initializeDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS keep_sessions (
      session_id uuid PRIMARY KEY,
      revision bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS keep_folders (
      session_id uuid NOT NULL REFERENCES keep_sessions(session_id) ON DELETE CASCADE,
      id uuid NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (session_id, id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS keep_notes (
      session_id uuid NOT NULL REFERENCES keep_sessions(session_id) ON DELETE CASCADE,
      id uuid NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (session_id, id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS keep_folders_session_idx ON keep_folders(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS keep_notes_session_idx ON keep_notes(session_id)`;
}

async function readState(sessionId: string) {
  const [sessionRows, folderRows, noteRows] = await sql.transaction([
    sql`SELECT revision FROM keep_sessions WHERE session_id = ${sessionId}`,
    sql`SELECT payload FROM keep_folders WHERE session_id = ${sessionId} ORDER BY created_at`,
    sql`SELECT payload FROM keep_notes WHERE session_id = ${sessionId} ORDER BY created_at DESC`,
  ]);
  const session = sessionRows[0] as { revision: string | number } | undefined;

  return {
    exists: Boolean(session),
    revision: Number(session?.revision ?? 0),
    folders: folderRows.map((row) => (row as { payload: StoredFolder }).payload),
    notes: noteRows.map((row) => (row as { payload: StoredNote }).payload),
  };
}

app.get("/api/health", async () => ({ status: "ok" }));

app.get<{ Querystring: SessionQuery }>("/api/state", async (request, reply) => {
  const { sessionId } = request.query;
  if (!validSessionId(sessionId)) {
    return reply.code(400).send({ error: "Invalid sessionId" });
  }
  return readState(sessionId);
});

app.put<{ Querystring: SessionQuery; Body: StoredState }>(
  "/api/state",
  async (request, reply) => {
    const { sessionId } = request.query;
    if (!validSessionId(sessionId)) {
      return reply.code(400).send({ error: "Invalid sessionId" });
    }

    const folders = Array.isArray(request.body?.folders) ? request.body.folders : [];
    const notes = Array.isArray(request.body?.notes) ? request.body.notes : [];
    if (
      [...folders, ...notes].some(
        (item) => !item || !validSessionId(item.id) || typeof item.createdAt !== "string",
      )
    ) {
      return reply.code(400).send({ error: "Invalid state" });
    }

    const queries = [
      sql`INSERT INTO keep_sessions (session_id) VALUES (${sessionId}) ON CONFLICT (session_id) DO NOTHING`,
      sql`DELETE FROM keep_notes WHERE session_id = ${sessionId}`,
      sql`DELETE FROM keep_folders WHERE session_id = ${sessionId}`,
      ...folders.map(
        (folder) => sql`INSERT INTO keep_folders (session_id, id, payload, created_at) VALUES (${sessionId}, ${folder.id}, ${JSON.stringify(folder)}::jsonb, ${folder.createdAt}::timestamptz)`,
      ),
      ...notes.map(
        (note) => sql`INSERT INTO keep_notes (session_id, id, payload, created_at) VALUES (${sessionId}, ${note.id}, ${JSON.stringify(note)}::jsonb, ${note.createdAt}::timestamptz)`,
      ),
      sql`UPDATE keep_sessions SET revision = revision + 1, updated_at = now() WHERE session_id = ${sessionId} RETURNING revision`,
    ];

    const results = await sql.transaction(queries);
    const revisionRows = results.at(-1) as Array<{ revision: string | number }>;
    return { revision: Number(revisionRows[0]?.revision ?? 0) };
  },
);

app.post<{ Body: MergeSessionsBody }>(
  "/api/state/merge",
  async (request, reply) => {
    const { targetSessionId, sourceSessionId } = request.body ?? {};
    if (
      !validSessionId(targetSessionId) ||
      !validSessionId(sourceSessionId) ||
      targetSessionId === sourceSessionId
    ) {
      return reply.code(400).send({ error: "Invalid session IDs" });
    }

    const sourceRows = await sql`
      SELECT 1 FROM keep_sessions WHERE session_id = ${sourceSessionId}
    `;
    if (!sourceRows.length) {
      return reply.code(404).send({ error: "Source session not found" });
    }

    await sql.transaction([
      sql`INSERT INTO keep_sessions (session_id) VALUES (${targetSessionId}) ON CONFLICT (session_id) DO NOTHING`,
      sql`
        INSERT INTO keep_folders (session_id, id, payload, created_at)
        SELECT ${targetSessionId}, id, payload, created_at
        FROM keep_folders
        WHERE session_id = ${sourceSessionId}
        ON CONFLICT (session_id, id) DO NOTHING
      `,
      sql`
        INSERT INTO keep_notes (session_id, id, payload, created_at)
        SELECT ${targetSessionId}, id, payload, created_at
        FROM keep_notes
        WHERE session_id = ${sourceSessionId}
        ON CONFLICT (session_id, id) DO NOTHING
      `,
      sql`
        UPDATE keep_sessions
        SET revision = revision + 1, updated_at = now()
        WHERE session_id = ${targetSessionId}
      `,
    ]);

    return readState(targetSessionId);
  },
);

app.get<{ Querystring: SessionQuery }>(
  "/api/state/events",
  async (request, reply) => {
    const { sessionId } = request.query;
    if (!validSessionId(sessionId)) {
      return reply.code(400).send({ error: "Invalid sessionId" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let lastRevision = -1;
    let checking = false;
    const checkForChanges = async () => {
      if (checking || reply.raw.destroyed) return;
      checking = true;
      try {
        const state = await readState(sessionId);
        if (state.revision !== lastRevision) {
          lastRevision = state.revision;
          reply.raw.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
        } else {
          reply.raw.write(": keep-alive\n\n");
        }
      } catch (error) {
        request.log.error(error);
      } finally {
        checking = false;
      }
    };

    await checkForChanges();
    const timer = setInterval(checkForChanges, 1_500);
    request.raw.on("close", () => clearInterval(timer));
  },
);

await initializeDatabase();
await app.register(fastify());

await app.listen({ port: 3000 });
console.log("Listening on http://localhost:3000");
