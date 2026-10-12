/** Strings for offline study + sync: [中文, English]. Kept separate from the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const OFFLINE_DICT = {
  offline: ["离线", "Offline"],
  online: ["在线", "Online"],
  pendingN: ["{n} 条待同步", "{n} to sync"],
  syncing: ["正在同步…", "Syncing…"],
  syncedN: ["已同步 {n} 条离线复习", "Synced {n} offline reviews"],
  syncedConflicts: ["已同步 {n} 条离线复习（{c} 张卡片按最新状态重新排程）", "Synced {n} offline reviews ({c} cards re-scheduled from newer server state)"],
  syncNow: ["立即同步", "Sync now"],
  downloadOffline: ["离线下载", "Download for offline"],
  removeOffline: ["移除离线副本", "Remove offline copy"],
  downloaded: ["已下载 {n} 张卡片供离线复习", "{n} cards available offline"],
  downloadFailed: ["离线下载失败", "Offline download failed"],
  removedOffline: ["已移除离线副本", "Offline copy removed"],
  availableOffline: ["可离线复习", "Available offline"],
  offlineStudyBanner: ["离线复习中 · 答题记录保存在本机，联网后自动同步", "Studying offline · answers are saved on this device and sync when you're back online"],
  offlineUnavailable: ["离线时不可用", "Not available offline"],
  e_offline_unavailable: ["当前离线，且此牌组尚未下载。联网后在牌组菜单中选择“离线下载”", "You're offline and this deck isn't downloaded. When online, choose “Download for offline” in the deck menu"],
  offlineDecksTitle: ["离线可用的牌组", "Decks available offline"],
  offlineDecksEmpty: ["当前离线。还没有下载任何牌组——联网后在牌组菜单中选择“离线下载”。", "You're offline. No decks downloaded yet — when online, use “Download for offline” in a deck's menu."],
  offlineDeckMeta: ["{n} 张卡片 · 更新于 {t}", "{n} cards · updated {t}"],
} as const;

export type OfflineKey = keyof typeof OFFLINE_DICT;

export function to(locale: Locale, key: OfflineKey | string, vars?: Record<string, string | number>): string {
  const e = (OFFLINE_DICT as Record<string, readonly [string, string]>)[key];
  let s = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
