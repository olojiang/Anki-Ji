/** Strings for deck sharing + incremental reading: [中文, English]. Kept out of the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const SI_DICT = {
  // ── sharing (owner) ──
  share: ["分享", "Share"], shareDeck: ["分享牌组", "Share deck"],
  shareIntro: ["生成只读链接：任何人都能预览这个牌组（含子牌组），登录后可复制到自己的收藏。你的复习进度不会被分享。", "Create a read-only link. Anyone can preview this deck (incl. sub-decks) and, once logged in, copy it to their collection. Your review progress is never shared."],
  shareDesc: ["简介（可选）", "Description (optional)"], shareDescPh: ["例如：JLPT N5 汉字，含例句", "e.g. JLPT N5 kanji with example sentences"],
  shareExpiry: ["有效期", "Expires"], expNever: ["永不过期", "Never"], exp1: ["1 天", "1 day"], exp7: ["7 天", "7 days"], exp30: ["30 天", "30 days"], exp90: ["90 天", "90 days"], exp365: ["1 年", "1 year"],
  createLink: ["生成链接", "Create link"], copyLink: ["复制链接", "Copy link"], copied: ["链接已复制", "Link copied"], openLink: ["打开", "Open"],
  revoke: ["撤销", "Revoke"], revokeQ: ["撤销后此链接将永久失效，已复制的内容不受影响。继续？", "The link will stop working for good. Copies already made are not affected. Continue?"],
  revoked: ["已撤销", "Revoked"], expired: ["已过期", "Expired"], active: ["有效", "Active"],
  views: ["{n} 次浏览", "{n} views"], clones: ["{n} 次复制", "{n} copies"], expiresOn: ["{d} 到期", "Expires {d}"], noExpiry: ["永久有效", "No expiry"],
  existingLinks: ["已有链接", "Existing links"], noLinks: ["还没有分享链接", "No share links yet"],
  // ── sharing (public page) ──
  cardsN1: ["1 张卡片", "1 card"], notesN1: ["1 条笔记", "1 note"], subdecksN1: ["1 个子牌组", "1 sub-deck"], extractN1: ["1 条摘录", "1 extract"],
  statQueue: ["今日", "Today"], statActive: ["进行中", "Active"],
  sharedDeck: ["共享牌组", "Shared deck"], cardsN: ["{n} 张卡片", "{n} cards"], notesN: ["{n} 条笔记", "{n} notes"], subdecksN: ["{n} 个子牌组", "{n} sub-decks"],
  structure: ["牌组结构", "Deck structure"], samples: ["示例卡片", "Sample cards"], tapToFlip: ["点击卡片翻面", "Tap a card to flip it"],
  copyToMine: ["复制到我的收藏", "Copy to my collection"], loginToCopy: ["登录后复制", "Log in to copy"], signupToCopy: ["注册新账号", "Create an account"],
  copyHint: ["复制为全新卡片（不含原作者的复习记录）。再次复制只会添加新增的卡片。", "Copied as brand-new cards (none of the owner's scheduling). Copying again only adds cards that are new."],
  cloneDone: ["已添加 {added} 条笔记（{cards} 张卡片），跳过 {skipped} 条已有笔记", "Added {added} notes ({cards} cards); skipped {skipped} you already have"],
  cloneOwn: ["这是你自己的牌组", "This is your own deck"], openDecks: ["去学习", "Go study"],
  sharedBy: ["通过 Anki-ji 分享 · 只读", "Shared via Anki-ji · read-only"], linkExpires: ["链接将于 {d} 失效", "Link expires {d}"],
  // ── reading ──
  navReading: ["渐进阅读", "Reading"], reading: ["渐进阅读", "Incremental reading"],
  readingSub: ["导入文章，按优先级分块阅读，把要点摘录或直接做成卡片", "Import articles, read them in prioritised chunks, extract key passages or turn them into cards"],
  importArticle: ["导入文章", "Import article"], paste: ["粘贴文本", "Paste text"], fromUrl: ["网址", "From URL"],
  title: ["标题", "Title"], titlePh: ["留空则自动生成", "Leave empty to auto-generate"], textLabel: ["正文（支持 Markdown）", "Text (Markdown supported)"], urlLabel: ["文章网址", "Article URL"],
  urlHint: ["服务器会抓取网页正文并转换为文本", "The server fetches the page and converts it to text"],
  priority: ["优先级", "Priority"], priorityHint: ["0–100，越高越重要、回来得越快", "0–100 — higher is more important and comes back sooner"],
  importBtn: ["导入", "Import"], fetching: ["正在抓取…", "Fetching…"],
  startReading: ["开始阅读", "Start reading"], todayQueue: ["今日队列", "Today's queue"], allItems: ["全部条目", "All items"], doneItems: ["已完成", "Done"],
  queueEmpty: ["今天没有要读的内容了", "Nothing left to read today"], noItems: ["还没有阅读材料，先导入一篇文章吧", "No reading material yet — import an article"],
  queueCap: ["每日上限 {n}", "Daily cap {n}"], queueMore: ["另有 {n} 篇因上限顺延", "{n} more held back by the cap"],
  dueToday: ["今天", "Today"], dueIn: ["{n} 天后", "in {n}d"], overdue: ["逾期 {n} 天", "{n}d overdue"],
  extract: ["摘录", "Extract"], extracts: ["摘录", "Extracts"], extractN: ["{n} 条摘录", "{n} extracts"], extracted: ["已创建摘录", "Extract created"],
  makeCloze: ["做填空卡", "Cloze card"], makeBasic: ["做问答卡", "Basic card"],
  selectHint: ["选中文字可摘录或制卡", "Select text to extract or make a card"],
  nextChunk: ["下一段", "Next chunk"], prevChunk: ["上一段", "Previous"], readEnough: ["今天读够了", "Read enough for now"], postpone: ["推迟", "Postpone"], markDone: ["读完了", "Done"],
  reopen: ["重新加入", "Reopen"], deleteItem: ["删除", "Delete"], deleteItemQ: ["删除这篇及其所有摘录？", "Delete this item and all its extracts?"],
  progress: ["进度 {p}%", "{p}% read"], endReached: ["已读到末尾", "End of text"], startOver: ["从头读", "Start over"],
  scheduledIn: ["下次 {n} 天后", "Next in {n}d"], postponedTo: ["已推迟 {n} 天", "Postponed {n}d"], doneToast: ["已标记为读完", "Marked as done"],
  nextInQueue: ["队列中的下一篇", "Next in queue"], backToReading: ["返回阅读列表", "Back to reading"], source: ["来源", "Source"], parent: ["来自", "From"],
  newCard: ["从选中内容制卡", "Card from selection"], deck: ["牌组", "Deck"], front: ["正面", "Front"], back: ["背面", "Back"], clozeText: ["填空文本", "Cloze text"], extra: ["补充", "Extra"],
  tags: ["标签", "Tags"], addCard: ["添加卡片", "Add card"], cardAdded: ["已添加卡片", "Card added"], showFull: ["显示全文", "Show full text"], showChunks: ["分段阅读", "Read in chunks"],
  readingSettings: ["渐进阅读", "Incremental reading"], dailyCap: ["每日阅读上限（篇）", "Daily reading cap (items)"], dailyCapHint: ["今日队列最多显示的条目数，其余顺延", "Max items in today's queue; the rest wait for later days"],
  reps: ["已读 {n} 次", "Read {n}×"], interval: ["间隔 {n} 天", "Interval {n}d"],
  // ── errors ──
  e_share_not_found: ["链接不存在、已撤销或已过期", "This link does not exist, was revoked or has expired"],
  e_rate_limited: ["操作太频繁，请稍后再试", "Too many copies — try again later"], e_share_too_large: ["牌组太大，无法一次复制（上限 5000 条笔记）", "Deck too large to copy (max 5,000 notes)"],
  e_deck_is_filtered: ["自定义学习牌组不能分享", "Custom study decks can't be shared"], e_deck_not_found: ["牌组不存在", "Deck not found"],
  e_content_required: ["请输入正文", "Text is required"], e_content_too_large: ["内容太长（上限 50 万字）", "Text too long (max 500k characters)"],
  e_invalid_url: ["网址无效", "Invalid URL"], e_blocked_url: ["不允许抓取该地址", "That address can't be fetched"], e_fetch_failed: ["抓取失败，请检查网址或改用粘贴", "Couldn't fetch the page — check the URL or paste the text"],
  e_unsupported_content: ["只支持网页或纯文本", "Only web pages or plain text are supported"], e_nothing_extracted: ["没有提取到正文", "No readable text found"],
  e_reading_not_found: ["条目不存在", "Item not found"],
} as const;

export type SiKey = keyof typeof SI_DICT;

export function tsi(locale: Locale, key: SiKey | string, vars?: Record<string, string | number>): string {
  const dict = SI_DICT as Record<string, readonly [string, string]>;
  const e = (vars?.n === 1 && dict[`${key}1`]) || dict[key];
  let s = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Translated message for one of our error codes, or null. */
export function siError(locale: Locale, e: unknown): string | null {
  const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : "");
  const key = `e_${code}`;
  return key in SI_DICT ? tsi(locale, key) : null;
}
