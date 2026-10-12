import { PGlite } from "@electric-sql/pglite";
import { setQueryImpl, ensureSchema, resetSchemaCache } from "@/server/db";

/** Real Postgres (WASM) behind the same query function the app uses in production. */
export async function usePglite() {
  const pg = await PGlite.create();
  setQueryImpl(async (text, params) => (await pg.query(text, params as unknown[])).rows as never[]);
  resetSchemaCache();
  await ensureSchema();
  return pg;
}
