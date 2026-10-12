"use client";
/**
 * Browser side of offline study: packs + outbox in IndexedDB, flushing the outbox to /api/sync/reviews,
 * and a small observable status (online / pending / syncing) for the UI.
 */
import { useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";
import { idbAll, idbDelete, idbGet, idbPut, hasIdb } from "./idb";
import { localAnswer, type OfflinePack, type OfflineReview } from "@/core/offline";
import type { Rating } from "@/core/types";

export interface OutboxEntry extends OfflineReview { uid: number }
interface PackRecord { key: string; uid: number; deckId: number; savedAt: number; pack: OfflinePack }
export interface PackInfo { deckId: number; deckName: string; cards: number; savedAt: number }

// ---------------------------------------------------------------- status store
export interface OfflineStatus { online: boolean; pending: number; syncing: boolean; packs: PackInfo[]; lastSyncAt: number | null }
let status: OfflineStatus = { online: true, pending: 0, syncing: false, packs: [], lastSyncAt: null };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<OfflineStatus>) { status = { ...status, ...patch }; listeners.forEach((l) => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const SERVER_STATUS: OfflineStatus = status;
export function useOfflineStatus(): OfflineStatus { return useSyncExternalStore(subscribe, () => status, () => SERVER_STATUS); }
export function getOfflineStatus() { return status; }

let reachable = true;
export function markReachable(ok: boolean) {
  reachable = ok;
  setStatus({ online: ok && (typeof navigator === "undefined" || navigator.onLine) });
}
export function refreshOnline() { setStatus({ online: reachable && navigator.onLine }); }

/** fetch() rejected (offline / DNS / connection reset) rather than the server answering with an error. */
export const isNetworkError = (e: unknown) => !(e instanceof ApiError);

// ---------------------------------------------------------------- user scoping
const UID_KEY = "ak-offline-uid";
export function currentUid(): number | null {
  const v = typeof localStorage !== "undefined" ? Number(localStorage.getItem(UID_KEY)) : NaN;
  return Number.isInteger(v) && v > 0 ? v : null;
}
export function setCurrentUid(uid: number) { localStorage.setItem(UID_KEY, String(uid)); void refreshCounts(); }

export function newReviewId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------- packs
const packKey = (uid: number, deckId: number) => `${uid}:${deckId}`;
export async function getPack(deckId: number): Promise<OfflinePack | null> {
  const uid = currentUid();
  if (!uid || !hasIdb()) return null;
  const rec = await idbGet<PackRecord>("packs", packKey(uid, deckId));
  return rec?.pack ?? null;
}
export async function putPack(pack: OfflinePack) {
  await idbPut("packs", { key: packKey(pack.uid, pack.deckId), uid: pack.uid, deckId: pack.deckId, savedAt: Date.now(), pack } satisfies PackRecord);
}
async function listPackRecords(): Promise<PackRecord[]> {
  const uid = currentUid();
  if (!uid || !hasIdb()) return [];
  return (await idbAll<PackRecord>("packs")).filter((r) => r.uid === uid);
}

function swPost(msg: unknown) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((r) => r.active?.postMessage(msg)).catch(() => {});
}

/** Download (or refresh) today's queue of a deck + its media + the pages needed to open it offline. */
export async function downloadDeck(deckId: number): Promise<OfflinePack> {
  const pack = await api<OfflinePack>(`/api/offline/deck/${deckId}`);
  if (currentUid() !== pack.uid) localStorage.setItem(UID_KEY, String(pack.uid));
  // keep local answers that have not been synced yet: re-apply them on top of the fresh pack
  const pending = (await outboxEntries()).filter((e) => e.deckId === deckId).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  let p = pack;
  for (const e of pending) if (p.cards.some((c) => c.id === e.cardId)) p = localAnswer(p, e.cardId, e.rating as Rating, { now: new Date(e.reviewedAt), durationMs: 0, id: e.id }).pack;
  await putPack(p);
  swPost({ type: "cache-pages", urls: [`/study/${deckId}`, "/"] });
  if (pack.media.length) swPost({ type: "cache-media", urls: pack.media });
  await refreshCounts();
  return p;
}

export async function removeDeck(deckId: number) {
  const uid = currentUid();
  if (!uid) return;
  await idbDelete("packs", packKey(uid, deckId));
  await refreshCounts();
}

/** Re-download every saved pack (after a sync, or when the app starts online). */
export async function refreshPacks() {
  for (const r of await listPackRecords()) {
    try { await downloadDeck(r.deckId); } catch (e) {
      if (e instanceof ApiError && e.status === 404) await removeDeck(r.deckId);
      else if (isNetworkError(e)) return;
    }
  }
}

/** Keep the local pack in step with an answer made online (so a later offline session doesn't re-show it). */
export async function mirrorOnlineAnswer(deckId: number, cardId: number, rating: Rating) {
  const p = await getPack(deckId);
  if (!p || !p.cards.some((c) => c.id === cardId)) return;
  await putPack(localAnswer(p, cardId, rating, { now: new Date(), durationMs: 0, id: "mirror" }).pack);
}

// ---------------------------------------------------------------- outbox
export async function outboxEntries(): Promise<OutboxEntry[]> {
  const uid = currentUid();
  if (!uid || !hasIdb()) return [];
  return (await idbAll<OutboxEntry>("outbox")).filter((e) => e.uid === uid);
}
export async function addOutbox(e: OutboxEntry) { await idbPut("outbox", e); await refreshCounts(); }
export async function removeOutbox(id: string) { await idbDelete("outbox", id); await refreshCounts(); }
export async function lastOutboxFor(deckId: number): Promise<OutboxEntry | null> {
  const list = (await outboxEntries()).filter((e) => e.deckId === deckId).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  return list[list.length - 1] ?? null;
}

export async function refreshCounts() {
  if (!hasIdb()) return;
  try {
    const [out, packs] = await Promise.all([outboxEntries(), listPackRecords()]);
    setStatus({ pending: out.length, packs: packs.map((r) => ({ deckId: r.deckId, deckName: r.pack.deckName, cards: r.pack.cards.length, savedAt: r.savedAt })) });
  } catch { /* IndexedDB unavailable (private mode) */ }
}

export interface FlushResult { synced: number; rescheduled: number; failed: boolean }
type SyncResponse = { results: { id: string; status: string }[]; counts: Record<string, number> };
const syncedListeners = new Set<(r: FlushResult) => void>();
export function onSynced(fn: (r: FlushResult) => void) { syncedListeners.add(fn); return () => { syncedListeners.delete(fn); }; }

const toPayload = (e: OutboxEntry): OfflineReview => ({ id: e.id, deckId: e.deckId, cardId: e.cardId, rating: e.rating, reviewedAt: e.reviewedAt, durationMs: e.durationMs, base: e.base, prev: e.prev, prevFlags: e.prevFlags, next: e.next, leech: e.leech });

let flushing: Promise<FlushResult> | null = null;
/** POST the outbox (oldest first, in chunks). Server replay is idempotent, so retries are safe. */
export function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const res: FlushResult = { synced: 0, rescheduled: 0, failed: false };
    const entries = (await outboxEntries()).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
    if (!entries.length) return res;
    setStatus({ syncing: true });
    try {
      for (let i = 0; i < entries.length; i += 200) {
        const chunk = entries.slice(i, i + 200);
        const r = await api<SyncResponse>("/api/sync/reviews", { body: { reviews: chunk.map(toPayload) } });
        const done = r.results.map((x) => x.id).filter((id) => chunk.some((e) => e.id === id));
        await idbDelete("outbox", done);
        res.synced += (r.counts.applied ?? 0) + (r.counts.rescheduled ?? 0);
        res.rescheduled += r.counts.rescheduled ?? 0;
      }
      markReachable(true);
    } catch (e) {
      res.failed = true;
      if (isNetworkError(e)) markReachable(false);
    } finally {
      setStatus({ syncing: false, ...(res.failed ? {} : { lastSyncAt: Date.now() }) });
      await refreshCounts();
    }
    if (res.synced) syncedListeners.forEach((l) => l(res));
    return res;
  })().finally(() => { flushing = null; });
  return flushing;
}
