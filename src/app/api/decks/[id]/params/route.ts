import { authed, body, intParam, HttpError } from "@/server/http";
import { listParamVersions, revertParams } from "@/server/services/autoopt";
import { requireDeck } from "@/server/repo/decks";

/** FSRS parameter versions (manual / auto / revert) with their log-loss and RMSE. */
export const GET = authed(async (_req, { uid, params }) => {
  const id = intParam(params.id);
  await requireDeck(uid, id);
  return { versions: await listParamVersions(uid, id) };
});

/** Revert: { versionId, target: "weights" | "previous" }. */
export const POST = authed(async (req, { uid, params }) => {
  const b = await body<{ versionId: number; target?: string }>(req);
  if (b.target && b.target !== "weights" && b.target !== "previous") throw new HttpError(400, "invalid_target");
  return revertParams(uid, intParam(params.id), intParam(String(b.versionId)), b.target === "previous" ? "previous" : "weights");
});
