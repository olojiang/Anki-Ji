import { neon, neonConfig } from "@neondatabase/serverless";
import { NOTETYPES_STATEMENTS } from "./schema/notetypes";
import { INTEROP_STATEMENTS } from "./schema/interop";

// Dev/test only: point the HTTP driver at a local Neon-compatible endpoint (PGlite shim).
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

type QueryFn = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

let impl: QueryFn | null = null;
function defaultImpl(): QueryFn {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "postgresql://user:pass@localhost.invalid/db";
  const sql = neon(url);
  return async (text, params) => (await sql.query(text, params)) as Record<string, unknown>[];
}

/** Swap the query implementation (tests use in-process PGlite). */
export function setQueryImpl(fn: QueryFn) { impl = fn; }

/** Run a parameterized query ($1, $2 …). The only way the app talks to Postgres. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!impl) impl = defaultImpl();
  await ensureSchema();
  return (await impl(text, params)) as T[];
}

// All tables use the ak_ prefix so the database can be shared safely.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ak_users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ak_users_email ON ak_users (lower(email))`,
  `CREATE TABLE IF NOT EXISTS ak_decks (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    parent_id INT REFERENCES ak_decks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    filtered BOOLEAN NOT NULL DEFAULT false,
    filter JSONB,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_decks_user ON ak_decks (user_id)`,
  `CREATE TABLE IF NOT EXISTS ak_notes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    deck_id INT NOT NULL REFERENCES ak_decks(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    type TEXT NOT NULL,
    fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags TEXT[] NOT NULL DEFAULT '{}',
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    sort_field TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, guid)
  )`,
  `CREATE INDEX IF NOT EXISTS ak_notes_user_deck ON ak_notes (user_id, deck_id)`,
  `CREATE TABLE IF NOT EXISTS ak_cards (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    note_id INT NOT NULL REFERENCES ak_notes(id) ON DELETE CASCADE,
    deck_id INT NOT NULL REFERENCES ak_decks(id) ON DELETE CASCADE,
    home_deck_id INT REFERENCES ak_decks(id) ON DELETE SET NULL,
    ord INT NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'new',
    due TIMESTAMPTZ NOT NULL DEFAULT to_timestamp(0),
    stability DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    scheduled_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    reps INT NOT NULL DEFAULT 0,
    lapses INT NOT NULL DEFAULT 0,
    step INT NOT NULL DEFAULT 0,
    last_review TIMESTAMPTZ,
    ease DOUBLE PRECISION NOT NULL DEFAULT 0,
    box INT NOT NULL DEFAULT 0,
    suspended BOOLEAN NOT NULL DEFAULT false,
    buried_day INT,
    flag INT NOT NULL DEFAULT 0,
    leech BOOLEAN NOT NULL DEFAULT false,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (note_id, ord)
  )`,
  `CREATE INDEX IF NOT EXISTS ak_cards_user_deck ON ak_cards (user_id, deck_id)`,
  `CREATE TABLE IF NOT EXISTS ak_revlog (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    card_id INT NOT NULL REFERENCES ak_cards(id) ON DELETE CASCADE,
    deck_id INT,
    note_id INT,
    rating INT NOT NULL,
    state TEXT NOT NULL,
    due TIMESTAMPTZ NOT NULL,
    stability DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    scheduled_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    day INT NOT NULL DEFAULT 0,
    algorithm TEXT NOT NULL DEFAULT 'fsrs',
    snapshot JSONB
  )`,
  `CREATE INDEX IF NOT EXISTS ak_revlog_user_time ON ak_revlog (user_id, reviewed_at)`,
  `CREATE INDEX IF NOT EXISTS ak_revlog_card ON ak_revlog (card_id)`,
  `CREATE TABLE IF NOT EXISTS ak_tags (
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ak_media (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    pathname TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    size INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  ...NOTETYPES_STATEMENTS,
  ...INTEROP_STATEMENTS,
];

let schemaPromise: Promise<void> | null = null;
export function resetSchemaCache() { schemaPromise = null; }
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      if (!impl) impl = defaultImpl();
      for (const s of STATEMENTS) await impl(s, []);
    })().catch((e) => { schemaPromise = null; throw e; });
  }
  return schemaPromise;
}

/** Placeholder list helper: ph(3, 2) → "$3, $4". */
export const ph = (start: number, n: number) => Array.from({ length: n }, (_, i) => `$${start + i}`).join(", ");
