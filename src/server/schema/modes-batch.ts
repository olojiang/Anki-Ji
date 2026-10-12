/** DDL for feat/modes-batch: batch-edit undo snapshots and cram-mode records (kept apart from ak_revlog so FSRS never sees them). */
export const MODES_BATCH_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS ak_batch_undo (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_batch_undo_user ON ak_batch_undo (user_id, id)`,
  `CREATE TABLE IF NOT EXISTS ak_mode_records (
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    scope_key TEXT NOT NULL,
    mode TEXT NOT NULL,
    best_ms INT,
    best_score REAL,
    last_ms INT,
    last_score REAL,
    plays INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, scope_key, mode)
  )`,
];
