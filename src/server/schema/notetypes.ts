/** DDL for custom note types (idempotent; appended to the main schema in db.ts). */
export const NOTETYPES_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ak_notetypes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES ak_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'standard',
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    templates JSONB NOT NULL DEFAULT '[]'::jsonb,
    css TEXT NOT NULL DEFAULT '',
    sort_field INT NOT NULL DEFAULT 0,
    markdown BOOLEAN NOT NULL DEFAULT true,
    source_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ak_notetypes_user ON ak_notetypes (user_id)`,
  `ALTER TABLE ak_notes ADD COLUMN IF NOT EXISTS notetype_id INT REFERENCES ak_notetypes(id)`,
  `CREATE INDEX IF NOT EXISTS ak_notes_notetype ON ak_notes (notetype_id) WHERE notetype_id IS NOT NULL`,
];
