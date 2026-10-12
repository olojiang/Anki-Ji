"use client";
/**
 * Study data source with offline fallback. Online it talks to /api/study/*; when the network fails
 * (or the browser is offline) it answers from the downloaded pack with the shared core scheduler and
 * queues the reviews in the IndexedDB outbox. Back online, the outbox is flushed and it switches back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { localAnswer, localStudyView, localUndo, type StudyView } from "@/core/offline";
import type { Rating } from "@/core/types";
import {
  addOutbox, downloadDeck, flushOutbox, getPack, isNetworkError, lastOutboxFor, markReachable, mirrorOnlineAnswer,
  newReviewId, outboxEntries, putPack, removeOutbox,
} from "./client";

export function useStudySource<S = StudyView>(deckId: number) {
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const prefetched = useRef(false);
  const go = useCallback((v: boolean) => { offlineRef.current = v; setOffline(v); }, []);

  const local = useCallback(async (): Promise<S> => {
    const p = await getPack(deckId).catch(() => null);
    if (!p) throw new ApiError(0, "offline_unavailable");
    go(true);
    return localStudyView(p, new Date()) as S;
  }, [deckId, go]);

  const load = useCallback(async (): Promise<S> => {
    if (typeof navigator === "undefined" || navigator.onLine) {
      try {
        if ((await outboxEntries().catch(() => [])).length) await flushOutbox();
        const s = await api<S>(`/api/study/${deckId}`);
        markReachable(true);
        go(false);
        // auto-prefetch today's queue of the deck being studied (once per page)
        if (!prefetched.current) { prefetched.current = true; downloadDeck(deckId).catch(() => {}); }
        return s;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        markReachable(false);
      }
    }
    return local();
  }, [deckId, go, local]);

  const answer = useCallback(async (cardId: number, rating: Rating, durationMs: number): Promise<{ leech: boolean; next: S | null }> => {
    if (!offlineRef.current) {
      try {
        const r = await api<{ leech: boolean; next: S | null }>("/api/study/answer", { body: { cardId, rating, durationMs, deckId } });
        mirrorOnlineAnswer(deckId, cardId, rating).catch(() => {});
        return r;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        markReachable(false);
      }
    }
    const p = await getPack(deckId);
    if (!p) throw new ApiError(0, "offline_unavailable");
    const res = localAnswer(p, cardId, rating, { now: new Date(), durationMs, id: newReviewId() });
    await putPack(res.pack);
    await addOutbox({ ...res.review, uid: p.uid });
    go(true);
    return { leech: res.leech, next: localStudyView(res.pack, new Date()) as S };
  }, [deckId, go]);

  const undo = useCallback(async (): Promise<{ undone: unknown; next: S | null }> => {
    if (!offlineRef.current) return api<{ undone: unknown; next: S | null }>("/api/study/undo", { body: { deckId } });
    const last = await lastOutboxFor(deckId);
    const p = await getPack(deckId);
    if (!last || !p) return { undone: null, next: null };
    const np = localUndo(p, last);
    await putPack(np);
    await removeOutbox(last.id);
    return { undone: last.cardId, next: localStudyView(np, new Date()) as S };
  }, [deckId]);

  // back online → push the outbox, then continue against the server
  useEffect(() => {
    const h = async () => {
      if (!offlineRef.current) return;
      const r = await flushOutbox();
      if (!r.failed) { markReachable(true); go(false); }
    };
    window.addEventListener("online", h);
    return () => window.removeEventListener("online", h);
  }, [go]);

  return { offline, load, answer, undo };
}
