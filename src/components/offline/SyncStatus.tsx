"use client";
/** Online/offline indicator + pending-sync badge. Hidden when online with nothing to sync. */
import { CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useApp } from "../providers";
import { cx } from "../ui";
import { to } from "@/lib/i18n-offline";
import { flushOutbox, useOfflineStatus } from "@/lib/offline/client";

export function SyncStatus({ variant = "full", className }: { variant?: "full" | "compact" | "mini" | "icon"; className?: string }) {
  const { locale } = useApp();
  const s = useOfflineStatus();
  if (s.online && s.pending === 0 && !s.syncing) return null;
  const label = !s.online ? to(locale, "offline") : s.syncing ? to(locale, "syncing") : to(locale, "pendingN", { n: s.pending });
  const title = [!s.online ? to(locale, "offline") : to(locale, "online"), s.pending ? to(locale, "pendingN", { n: s.pending }) : ""].filter(Boolean).join(" · ");
  const Icon = !s.online ? CloudOff : s.syncing ? RefreshCw : CloudUpload;
  const tone = !s.online ? "bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25" : "bg-primary/10 text-primary-strong ring-primary/25";
  const canSync = s.online && s.pending > 0 && !s.syncing;
  const onClick = () => { if (canSync) flushOutbox().catch(() => {}); };
  const badge = s.pending > 0 && (
    <span data-testid="pending-count" className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-black/[0.07] px-1 text-[10.5px] font-semibold leading-none dark:bg-white/10">{s.pending}</span>
  );
  if (variant === "icon") {
    return (
      <button type="button" onClick={onClick} title={title} aria-label={title} data-testid="sync-status" data-online={s.online ? "1" : "0"}
        className={cx("focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset", tone, className)}>
        <Icon className={cx("h-[18px] w-[18px]", s.syncing && "animate-spin")} />
        {s.pending > 0 && <span className="num absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10.5px] font-semibold leading-none text-primary-fg shadow-xs">{s.pending}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} data-testid="sync-status" data-online={s.online ? "1" : "0"}
      className={cx("focus-ring inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full text-[12px]", variant === "mini" ? "px-2.5" : "px-3", "font-medium ring-1 ring-inset transition-colors lg:h-8", tone, canSync && "cursor-pointer hover:brightness-95", className)}>
      <Icon className={cx("h-3.5 w-3.5 shrink-0", s.syncing && "animate-spin")} />
      {variant === "full" ? <span className="truncate">{label}</span> : variant === "compact" && !s.online && <span>{to(locale, "offline")}</span>}
      {variant !== "full" || !s.online ? badge : null}
    </button>
  );
}

/** Banner on the study page while answering from the local copy. */
export function OfflineStudyBanner({ show }: { show: boolean }) {
  const { locale } = useApp();
  if (!show) return null;
  return (
    <div data-testid="offline-banner" className="mb-3 flex animate-rise-in items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
      <CloudOff className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{to(locale, "offlineStudyBanner")}</span>
    </div>
  );
}
