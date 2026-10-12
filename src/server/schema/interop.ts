/** DDL for API tokens (AnkiConnect-compatible API + browser extension). Idempotent. */
export const INTEROP_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ak_api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL,
    prefix TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ak_api_tokens_hash ON ak_api_tokens (token_hash)`,
  `CREATE INDEX IF NOT EXISTS ak_api_tokens_user ON ak_api_tokens (user_id)`,
];
