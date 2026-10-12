/** DDL for AI card generation (bring-your-own-key) and TTS preferences. Idempotent. */
export const AI_TTS_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ak_ai_settings (
    user_id INT PRIMARY KEY REFERENCES ak_users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    key_enc TEXT,
    key_last4 TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS ak_tts_settings (
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    opts JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, scope)
  )`,
];
