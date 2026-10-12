/** Offline review sync: client-generated review ids make /api/sync/reviews idempotent. Idempotent DDL. */
export const OFFLINE_SCHEMA: string[] = [
  `ALTER TABLE ak_revlog ADD COLUMN IF NOT EXISTS client_id TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ak_revlog_client_id ON ak_revlog (user_id, client_id)`,
];
