import { neon } from "@neondatabase/serverless";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Fastify from "fastify";
import { useRuntime } from "runable";
import { fastify } from "runable/adapters/fastify";

try {
  process.loadEnvFile();
} catch {
  // The environment can also be provided by the hosting platform.
}

const runtime = useRuntime() as Record<string, unknown>;

function runtimeString(key: string, legacyKey?: string) {
  const value =
    runtime[key] ?? (legacyKey ? process.env[legacyKey] : undefined);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const databaseUrl = runtimeString("databaseUrl", "DATABASE_URL");
if (!databaseUrl) throw new Error("RUN_DATABASE_URL is required");
const authSecret = runtimeString("authSecret", "AUTH_SECRET");
const resendApiKey = runtimeString("resendApiKey", "RESEND_API_KEY");
const loginEmailFrom = runtimeString("loginEmailFrom");
if (!loginEmailFrom) throw new Error("RUN_LOGIN_EMAIL_FROM is required");
const publicRuntime =
  runtime.public && typeof runtime.public === "object"
    ? (runtime.public as Record<string, unknown>)
    : {};
const emailAppName =
  (typeof publicRuntime.appName === "string" &&
    publicRuntime.appName.trim()) ||
  "Keep";
const configuredAppUrl =
  (typeof publicRuntime.appUrl === "string" && publicRuntime.appUrl.trim()) ||
  process.env.APP_URL ||
  "http://localhost:3000";
const emailLogoUrl = new URL(
  "/logo.png",
  configuredAppUrl.endsWith("/") ? configuredAppUrl : `${configuredAppUrl}/`,
).toString();
const loginCodeSubject =
  runtimeString("loginCodeSubject") ??
  `Votre code de connexion ${emailAppName}`;
const configuredExpiration = Number(runtime.loginCodeExpiresMinutes ?? 10);
const loginCodeExpiresMinutes =
  Number.isInteger(configuredExpiration) && configuredExpiration > 0
    ? configuredExpiration
    : 10;
const loginCodeTemplatePath = runtimeString("loginCodeTemplate");
const loginCodeTemplateSource = loginCodeTemplatePath
  ? resolve(process.cwd(), loginCodeTemplatePath)
  : new URL(
      "./server/email-templates/login-code.template.html",
      import.meta.url,
    );
let loginCodeTemplatePromise: Promise<string> | undefined;

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

interface RequestCodeBody {
  email?: string;
}

interface VerifyCodeBody extends RequestCodeBody {
  code?: string;
  sessionId?: string;
}

interface UpdateProfileBody {
  name?: string;
  avatar?: string | null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") return;
  const email = value.trim().toLocaleLowerCase("en-US");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  return email;
}

function defaultUserName(email: string) {
  const localPart = email.split("@", 1)[0]?.split("+", 1)[0] ?? "";
  const words = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const name = words
    .map(
      (word) =>
        `${word.charAt(0).toLocaleUpperCase("fr-FR")}${word.slice(1).toLocaleLowerCase("fr-FR")}`,
    )
    .join(" ");

  return name || "Utilisateur";
}

function codeHash(email: string, code: string) {
  if (!authSecret) throw new Error("RUN_AUTH_SECRET is required");
  return createHmac("sha256", authSecret)
    .update(`${email}:${code}`)
    .digest("hex");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieValue(cookieHeader: string | undefined, name: string) {
  for (const part of cookieHeader?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
}

function authCookie(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `keep_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function renderLoginCodeTemplate(code: string) {
  loginCodeTemplatePromise ??= readFile(loginCodeTemplateSource, "utf8");
  const source = await loginCodeTemplatePromise;
  const safeCode = escapeHtml(code);
  const formattedCode = `${safeCode.slice(0, 3)}-${safeCode.slice(3)}`;
  const safeAppName = escapeHtml(emailAppName);
  const safeSubject = escapeHtml(loginCodeSubject);

  return source
    .replaceAll("{{SUBJECT}}", safeSubject)
    .replaceAll("{{APP_NAME}}", safeAppName)
    .replaceAll("{{LOGO_URL}}", escapeHtml(emailLogoUrl))
    .replaceAll("{{CODE}}", formattedCode)
    .replaceAll("{{EXPIRES_IN_MINUTES}}", String(loginCodeExpiresMinutes));
}

async function sendCodeEmail(email: string, code: string) {
  if (!resendApiKey) {
    throw new Error("RUN_RESEND_API_KEY is required");
  }

  const html = await renderLoginCodeTemplate(code);
  const text = [
    `Connexion à ${emailAppName}`,
    "",
    `Votre code de validation est : ${code.slice(0, 3)}-${code.slice(3)}`,
    "",
    `Ce code expire dans ${loginCodeExpiresMinutes} minutes.`,
    "Ne partagez ce code avec personne.",
    "",
    "Si vous n’avez pas demandé ce code, vous pouvez ignorer cet e-mail.",
  ].join("\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: loginEmailFrom,
      to: [email],
      subject: loginCodeSubject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status})`);
  }
}

async function initializeDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS keep_users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      avatar text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE keep_users ADD COLUMN IF NOT EXISTS name text`;
  await sql`ALTER TABLE keep_users ADD COLUMN IF NOT EXISTS avatar text`;
  await sql`
    UPDATE keep_users
    SET name = COALESCE(
      NULLIF(
        initcap(
          trim(
            regexp_replace(
              split_part(split_part(email, '@', 1), '+', 1),
              '[._-]+',
              ' ',
              'g'
            )
          )
        ),
        ''
      ),
      'Utilisateur'
    )
    WHERE name IS NULL OR trim(name) = ''
  `;
  await sql`ALTER TABLE keep_users ALTER COLUMN name SET NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS keep_sessions (
      session_id uuid PRIMARY KEY,
      revision bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE keep_sessions ADD COLUMN IF NOT EXISTS user_id uuid`;
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
  await sql`CREATE INDEX IF NOT EXISTS keep_sessions_user_idx ON keep_sessions(user_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS keep_login_codes (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      code_hash text NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS keep_login_codes_email_idx ON keep_login_codes(email, created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS keep_auth_sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES keep_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
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
    folders: folderRows.map(
      (row) => (row as { payload: StoredFolder }).payload,
    ),
    notes: noteRows.map((row) => (row as { payload: StoredNote }).payload),
  };
}

app.get("/api/health", async () => ({ status: "ok" }));

app.post<{ Body: RequestCodeBody }>(
  "/api/auth/request-code",
  async (request, reply) => {
    const email = normalizedEmail(request.body?.email);
    if (!email) return reply.code(400).send({ error: "Invalid email" });
    if (!authSecret || !resendApiKey) {
      return reply
        .code(503)
        .send({ error: "Email authentication is not configured" });
    }

    const recentCodes = await sql`
      SELECT 1 FROM keep_login_codes
      WHERE email = ${email} AND created_at > now() - interval '60 seconds'
      LIMIT 1
    `;
    if (recentCodes.length) {
      return reply
        .code(429)
        .send({ error: "Please wait before requesting another code" });
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeId = randomUUID();
    await sql`
      INSERT INTO keep_login_codes (id, email, code_hash, expires_at)
      VALUES (
        ${codeId},
        ${email},
        ${codeHash(email, code)},
        now() + (${loginCodeExpiresMinutes} * interval '1 minute')
      )
    `;

    try {
      await sendCodeEmail(email, code);
    } catch (error) {
      request.log.error(error);
      await sql`DELETE FROM keep_login_codes WHERE id = ${codeId}`;
      return reply.code(502).send({ error: "Email delivery failed" });
    }

    return { sent: true };
  },
);

app.post<{ Body: VerifyCodeBody }>(
  "/api/auth/verify-code",
  async (request, reply) => {
    const email = normalizedEmail(request.body?.email);
    const { code, sessionId } = request.body ?? {};
    if (
      !email ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code) ||
      !validSessionId(sessionId) ||
      !authSecret
    ) {
      return reply.code(400).send({ error: "Invalid verification request" });
    }

    const rows = await sql`
      SELECT id, code_hash, attempts, expires_at
      FROM keep_login_codes
      WHERE email = ${email} AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const loginCode = rows[0] as
      | { id: string; code_hash: string; attempts: number; expires_at: string }
      | undefined;
    const expectedHash = loginCode
      ? Buffer.from(loginCode.code_hash, "hex")
      : Buffer.alloc(32);
    const receivedHash = Buffer.from(codeHash(email, code), "hex");
    const codeMatches = timingSafeEqual(expectedHash, receivedHash);

    if (
      !loginCode ||
      loginCode.attempts >= 5 ||
      new Date(loginCode.expires_at).getTime() < Date.now() ||
      !codeMatches
    ) {
      if (loginCode) {
        await sql`UPDATE keep_login_codes SET attempts = attempts + 1 WHERE id = ${loginCode.id}`;
      }
      return reply.code(401).send({ error: "Invalid or expired code" });
    }

    const userRows = await sql`
      INSERT INTO keep_users (id, email, name)
      VALUES (${randomUUID()}, ${email}, ${defaultUserName(email)})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email, name, avatar
    `;
    const user = userRows[0] as {
      id: string;
      email: string;
      name: string;
      avatar: string | null;
    };
    await sql`INSERT INTO keep_sessions (session_id) VALUES (${sessionId}) ON CONFLICT (session_id) DO NOTHING`;

    const ownedSessions = await sql`
      SELECT session_id FROM keep_sessions
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const ownedSessionId = (
      ownedSessions[0] as { session_id: string } | undefined
    )?.session_id;
    const targetSessionId = ownedSessionId ?? sessionId;

    const mergeQueries = [
      sql`UPDATE keep_login_codes SET consumed_at = now() WHERE id = ${loginCode.id}`,
      sql`UPDATE keep_sessions SET user_id = ${user.id} WHERE session_id = ${targetSessionId}`,
    ];
    if (targetSessionId !== sessionId) {
      mergeQueries.push(
        sql`
          INSERT INTO keep_folders (session_id, id, payload, created_at)
          SELECT ${targetSessionId}, id, payload, created_at FROM keep_folders
          WHERE session_id = ${sessionId}
          ON CONFLICT (session_id, id) DO NOTHING
        `,
        sql`
          INSERT INTO keep_notes (session_id, id, payload, created_at)
          SELECT ${targetSessionId}, id, payload, created_at FROM keep_notes
          WHERE session_id = ${sessionId}
          ON CONFLICT (session_id, id) DO NOTHING
        `,
        sql`UPDATE keep_sessions SET revision = revision + 1, updated_at = now() WHERE session_id = ${targetSessionId}`,
      );
    }
    await sql.transaction(mergeQueries);

    const token = randomBytes(32).toString("base64url");
    await sql`
      INSERT INTO keep_auth_sessions (token_hash, user_id, expires_at)
      VALUES (${tokenHash(token)}, ${user.id}, now() + interval '30 days')
    `;
    reply.header("Set-Cookie", authCookie(token, 60 * 60 * 24 * 30));
    return {
      user: { email: user.email, name: user.name, avatar: user.avatar },
      sessionId: targetSessionId,
    };
  },
);

app.get("/api/auth/me", async (request) => {
  const token = cookieValue(request.headers.cookie, "keep_auth");
  if (!token) return { user: null };

  const rows = await sql`
    SELECT users.email, users.name, users.avatar
    FROM keep_auth_sessions auth
    JOIN keep_users users ON users.id = auth.user_id
    WHERE auth.token_hash = ${tokenHash(token)} AND auth.expires_at > now()
    LIMIT 1
  `;
  const user = rows[0] as
    | { email: string; name: string; avatar: string | null }
    | undefined;
  return {
    user: user
      ? { email: user.email, name: user.name, avatar: user.avatar }
      : null,
  };
});

app.patch<{ Body: UpdateProfileBody }>(
  "/api/auth/me",
  async (request, reply) => {
    const token = cookieValue(request.headers.cookie, "keep_auth");
    if (!token) return reply.code(401).send({ error: "Unauthorized" });

    const name = request.body?.name?.trim().replace(/\s+/g, " ");
    const avatar = request.body?.avatar ?? null;
    const validAvatar =
      avatar === null ||
      (avatar.length <= 500_000 &&
        /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(avatar));

    if (!name || name.length > 80 || !validAvatar) {
      return reply.code(400).send({ error: "Invalid profile" });
    }

    const rows = await sql`
      UPDATE keep_users users
      SET name = ${name}, avatar = ${avatar}
      FROM keep_auth_sessions auth
      WHERE auth.user_id = users.id
        AND auth.token_hash = ${tokenHash(token)}
        AND auth.expires_at > now()
      RETURNING users.email, users.name, users.avatar
    `;
    const user = rows[0] as
      | { email: string; name: string; avatar: string | null }
      | undefined;

    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    return { user };
  },
);

app.post("/api/auth/logout", async (request, reply) => {
  const token = cookieValue(request.headers.cookie, "keep_auth");
  if (token) {
    await sql`DELETE FROM keep_auth_sessions WHERE token_hash = ${tokenHash(token)}`;
  }
  reply.header("Set-Cookie", authCookie("", 0));
  return { loggedOut: true };
});

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

    const folders = Array.isArray(request.body?.folders)
      ? request.body.folders
      : [];
    const notes = Array.isArray(request.body?.notes) ? request.body.notes : [];
    if (
      [...folders, ...notes].some(
        (item) =>
          !item ||
          !validSessionId(item.id) ||
          typeof item.createdAt !== "string",
      )
    ) {
      return reply.code(400).send({ error: "Invalid state" });
    }

    const queries = [
      sql`INSERT INTO keep_sessions (session_id) VALUES (${sessionId}) ON CONFLICT (session_id) DO NOTHING`,
      sql`DELETE FROM keep_notes WHERE session_id = ${sessionId}`,
      sql`DELETE FROM keep_folders WHERE session_id = ${sessionId}`,
      ...folders.map(
        (folder) =>
          sql`INSERT INTO keep_folders (session_id, id, payload, created_at) VALUES (${sessionId}, ${folder.id}, ${JSON.stringify(folder)}::jsonb, ${folder.createdAt}::timestamptz)`,
      ),
      ...notes.map(
        (note) =>
          sql`INSERT INTO keep_notes (session_id, id, payload, created_at) VALUES (${sessionId}, ${note.id}, ${JSON.stringify(note)}::jsonb, ${note.createdAt}::timestamptz)`,
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
