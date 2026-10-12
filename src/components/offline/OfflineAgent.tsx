"use client";
/** Mounted once in the app shell: registers the service worker, tracks connectivity and flushes the outbox. */
import { useEffect } from "react";
import { useApp } from "../providers";
import { to } from "@/lib/i18n-offline";
import { api } from "@/lib/api";
import { flushOutbox, getOfflineStatus, onSynced, refreshCounts, refreshOnline, refreshPacks, setCurrentUid } from "@/lib/offline/client";

export function OfflineAgent() {
  const { locale, toast } = useApp();

  useEffect(() => onSynced((r) => toast(r.rescheduled ? to(locale, "syncedConflicts", { n: r.synced, c: r.rescheduled }) : to(locale, "syncedN", { n: r.synced }))), [locale, toast]);

  useEffect(() => {
    let stop = false;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
        // assets fetched before the worker took control: hand them over so the shell opens offline
        const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin) && u.includes("/_next/static/"));
        reg.active?.postMessage({ type: "cache-urls", urls });
        reg.active?.postMessage({ type: "cache-pages", urls: [location.pathname] });
      }).catch(() => {});
    }
    refreshOnline();
    refreshCounts();
    const sync = async () => {
      if (!navigator.onLine) return;
      const r = await flushOutbox();
      if (!r.failed && !stop) refreshPacks().catch(() => {});
    };
    api<{ user: { id: number } }>("/api/auth/me").then((r) => { setCurrentUid(r.user.id); sync(); }).catch(() => refreshOnline());
    const online = () => { refreshOnline(); sync(); };
    const offline = () => refreshOnline();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = setInterval(() => { if (navigator.onLine && getOfflineStatus().pending > 0) flushOutbox().catch(() => {}); }, 45_000);
    return () => { stop = true; window.removeEventListener("online", online); window.removeEventListener("offline", offline); clearInterval(timer); };
  }, []);

  return null;
}
