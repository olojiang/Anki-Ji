/** Strings for Anki interop UI (.apkg export, API tokens, browser extension): [中文, English]. */
import type { Locale } from "./i18n";

export const INTEROP_DICT = {
  apkgTitle: ["Anki 包（.apkg）", "Anki package (.apkg)"],
  apkgDesc: ["导出为 Anki 桌面版 / AnkiDroid / AnkiMobile 可直接导入的 .apkg。选择题与图片遮挡会转为带图片的基础卡片。", "Export a .apkg that Anki desktop, AnkiDroid and AnkiMobile can import. Multiple choice and image occlusion become Basic cards with rendered HTML."],
  apkgScope: ["范围", "Scope"],
  apkgWhole: ["整个收藏", "Whole collection"],
  apkgScheduling: ["包含复习进度与历史", "Include scheduling & review history"],
  apkgMedia: ["包含媒体文件", "Include media"],
  apkgExport: ["导出 .apkg", "Export .apkg"],
  apkgPreparing: ["正在准备数据…", "Preparing data…"],
  apkgMediaProgress: ["下载媒体 {i}/{n}", "Downloading media {i}/{n}"],
  apkgBuilding: ["正在生成 Anki 包…", "Building Anki package…"],
  apkgDone: ["已导出 {notes} 条笔记、{cards} 张卡片、{media} 个媒体文件", "Exported {notes} notes, {cards} cards, {media} media files"],
  apkgSkipped: ["（{n} 个媒体过大或无法下载，保留为链接）", " ({n} media files too large or unavailable — kept as links)"],
  apkgEmpty: ["这个范围里没有卡片", "Nothing to export in this scope"],

  apiTitle: ["API 与浏览器扩展", "API & browser extension"],
  apiDesc: ["个人令牌可让 Yomitan、浏览器扩展等 AnkiConnect 工具向你的 Anki-ji 添加卡片。令牌只显示一次，服务器仅保存其哈希。", "Personal tokens let Yomitan, the browser extension and other AnkiConnect tools add cards to Anki-ji. A token is shown once; only its hash is stored."],
  apiEndpoint: ["AnkiConnect 地址", "AnkiConnect URL"],
  apiTokenName: ["令牌名称", "Token name"],
  apiTokenNamePh: ["例如：Yomitan / 笔记本电脑", "e.g. Yomitan / laptop"],
  apiCreate: ["生成令牌", "Create token"],
  apiNoTokens: ["还没有令牌", "No tokens yet"],
  apiCreated: ["创建于 {d}", "Created {d}"],
  apiLastUsed: ["最近使用 {d}", "Last used {d}"],
  apiNeverUsed: ["从未使用", "Never used"],
  apiRevoke: ["撤销", "Revoke"],
  apiRevokeQ: ["撤销令牌“{name}”？使用它的工具将无法再访问。", "Revoke “{name}”? Tools using it will stop working."],
  apiNewToken: ["新令牌", "New token"],
  apiCopyOnce: ["请立即复制并妥善保存——关闭后将无法再次查看。", "Copy it now and keep it safe — you won't see it again."],
  apiCopy: ["复制", "Copy"], apiCopied: ["已复制", "Copied"],
  apiYomitan: ["Yomitan：设置 → Anki → AnkiConnect server address 填上面的地址，API key 填令牌。", "Yomitan: Settings → Anki → set the AnkiConnect server address to the URL above and the API key to your token."],
  extTitle: ["浏览器扩展（Chrome / Edge）", "Browser extension (Chrome / Edge)"],
  extDesc: ["选中网页文字 → 右键“添加到 Anki-ji”，或按 Alt+Shift+A。下载后解压，在 chrome://extensions 打开“开发者模式”→“加载已解压的扩展程序”。", "Select text → right-click “Add to Anki-ji”, or press Alt+Shift+A. Unzip, open chrome://extensions, enable Developer mode → Load unpacked."],
  extDownload: ["下载扩展 .zip", "Download extension .zip"],
} as const;

export function tx(locale: Locale, key: keyof typeof INTEROP_DICT, vars?: Record<string, string | number>): string {
  const e = INTEROP_DICT[key];
  let s: string = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
