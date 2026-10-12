/** DDL for FSRS auto-optimization history, study preferences (goal / reminders) and Web Push subscriptions. Idempotent. */
export const FSRS_REMIND_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ak_study_prefs (
    user_id INT PRIMARY KEY REFERENCES ak_users(id) ON DELETE CASCADE,
    prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    reminder_last_sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS ak_fsrs_params (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    deck_id INT NOT NULL REFERENCES ak_decks(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'manual',
    adopted BOOLEAN NOT NULL DEFAULT false,
    weights JSONB,
    prev_weights JSONB,
    log_loss DOUBLE PRECISION,
    rmse DOUBLE PRECISION,
    prev_log_loss DOUBLE PRECISION,
    prev_rmse DOUBLE PRECISION,
    items INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_fsrs_params_deck ON ak_fsrs_params (user_id, deck_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ak_push_subs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_push_subs_user ON ak_push_subs (user_id)`,
];
