/** DDL for deck sharing + incremental reading (idempotent, appended to the main schema). */
export const SHARE_IR_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS ak_shares (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    deck_id INT NOT NULL REFERENCES ak_decks(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    view_count INT NOT NULL DEFAULT 0,
    clone_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_shares_user ON ak_shares (user_id, deck_id)`,
  `CREATE TABLE IF NOT EXISTS ak_share_clones (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    share_id INT NOT NULL REFERENCES ak_shares(id) ON DELETE CASCADE,
    root_deck_id INT REFERENCES ak_decks(id) ON DELETE SET NULL,
    notes_added INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_share_clones_user ON ak_share_clones (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ak_reading_items (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    parent_id INT REFERENCES ak_reading_items(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    priority INT NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'active',
    due_day INT NOT NULL DEFAULT 0,
    interval_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    reps INT NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    last_read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_reading_items_user ON ak_reading_items (user_id, status, due_day)`,
  `CREATE TABLE IF NOT EXISTS ak_reading_prefs (
    user_id INT PRIMARY KEY REFERENCES ak_users(id) ON DELETE CASCADE,
    daily_cap INT NOT NULL DEFAULT 20
  )`,
];
