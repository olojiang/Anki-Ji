"use client";
import { api } from "./api";
import type { Backup } from "@/core/io/backup";
import type { ApkgExportStats, ExportMedia } from "@/core/io/apkg-export";

export type ApkgProgress = (step: "preparing" | "media" | "building", vars?: { i: number; n: number }) => void;

/**
 * Builds the .apkg in the browser (no serverless memory/time limits): the server only returns the JSON
 * collection; media bytes are fetched directly from storage and sql.js writes the Anki collection.
 */
export async function buildApkg(opts: { deckId: number | null; includeScheduling: boolean; withMedia: boolean }, progress: ApkgProgress): Promise<{ blob: Blob; stats: ApkgExportStats }> {
  progress("preparing");
  const [backup, { exportApkg, referencedMedia }, SQL] = await Promise.all([
    api<Backup>("/api/export?format=json"),
    import("@/core/io/apkg-export"),
    import("sql.js").then(({ default: init }) => init({ locateFile: () => "/sql-wasm.wasm" })),
  ]);
  const media: ExportMedia[] = [];
  if (opts.withMedia) {
    const urls = referencedMedia(backup, opts.deckId).filter((u) => !u.startsWith("data:"));
    const byUrl = new Map(backup.media.map((m) => [m.url, m]));
    let done = 0;
    const queue = [...urls];
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try {
          const res = await fetch(u);
          if (res.ok) media.push({ url: u, filename: byUrl.get(u)?.filename || u.split("/").pop() || "file", bytes: new Uint8Array(await res.arrayBuffer()) });
        } catch { /* keep as remote link */ }
        progress("media", { i: ++done, n: urls.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  }
  progress("building");
  const { bytes, stats } = await exportApkg({ backup, deckId: opts.deckId, includeScheduling: opts.includeScheduling, media, SQL });
  return { blob: new Blob([bytes as BlobPart], { type: "application/octet-stream" }), stats };
}
