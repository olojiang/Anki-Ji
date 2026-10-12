/** Strings for the import formats UI: [中文, English]. Kept separate from the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const IMPORT_DICT = {
  importDescAll: ["支持 Anki-ji 备份 .json、Anki .apkg、CSV/TSV/TXT、Excel、Markdown / Obsidian（含 .zip 仓库与附件）、Mochi、RemNote、SuperMemo、Mnemosyne；也可直接粘贴文本", "Anki-ji .json, Anki .apkg, CSV/TSV/TXT, Excel, Markdown / Obsidian (incl. zipped vault + attachments), Mochi, RemNote, SuperMemo, Mnemosyne — or paste text"],
  previewTitle: ["导入预览", "Import preview"],
  pvNotes: ["题目", "Notes"], pvCards: ["卡片", "Cards"], pvDecks: ["牌组", "Decks"], pvMedia: ["媒体", "Media"],
  pvDupes: ["文件内重复 {n} 个（已合并）", "{n} duplicates in file (merged)"],
  pvExisting: ["{n} 个已存在，将跳过", "{n} already in your collection — will be skipped"],
  pvSamples: ["示例卡片", "Sample cards"], pvFront: ["正面", "Front"], pvBack: ["背面", "Back"],
  pvIssues: ["{n} 条提示", "{n} notes"], pvMore: ["等 {n} 个", "+{n} more"],
  rootDeck: ["导入到牌组", "Import into deck"],
  rootDeckHint: ["标题 / 文件夹 / 工作表 / 层级会成为它的子牌组", "Headings / folders / sheets / hierarchy become sub-decks"],
  pasteTitle: ["粘贴导入", "Paste import"],
  pasteDesc: ["粘贴文本，选择格式后先预览再导入", "Paste text, pick a format, preview, then import"],
  pasteFormat: ["格式", "Format"], pastePh: ["在这里粘贴…", "Paste here…"], preview: ["预览", "Preview"],
  fmt_smart: ["智能识别（问答 / 术语：释义 / 填空…）", "Smart (Q/A, term: definition, cloze…)"],
  fmt_quizlet: ["Quizlet / Knowt / Brainscape 导出", "Quizlet / Knowt / Brainscape export"],
  fmt_supermemo: ["SuperMemo 问答（Q: / A:）", "SuperMemo Q&A (Q: / A:)"],
  fmt_markdown: ["Markdown / Obsidian（Q::A、?、==高亮==）", "Markdown / Obsidian (Q::A, ?, ==highlight==)"],
  fmt_remnote: ["RemNote（>> :: << >>>）", "RemNote (>> :: << >>>)"],
  fmt_csv: ["CSV / TSV 表格", "CSV / TSV table"],
  termSep: ["词条与释义之间", "Between term and definition"], rowSep: ["卡片之间", "Between cards"],
  sepTab: ["制表符", "Tab"], sepComma: ["逗号", "Comma"], sepNewline: ["换行", "New line"], sepSemicolon: ["分号", "Semicolon"], sepCustom: ["自定义", "Custom"],
  smartHint: ["规则：Q:/A:、问：/答：、编号题 + 缩进答案、术语：释义、term - definition、a = b、a :: b、{{c1::填空}} / ==高亮==；# 标题会成为子牌组", "Rules: Q:/A:, numbered question + indented answer, term: definition, term - definition, a = b, a :: b, {{c1::cloze}} / ==highlight==; # headings become sub-decks"],
  e_unknown_format: ["无法识别的文件格式", "Unrecognised file format"], e_not_mochi: ["不是有效的 Mochi 导出（.mochi）", "Not a valid Mochi export"],
  e_not_spreadsheet: ["不是有效的 Excel 文件", "Not a valid spreadsheet"], e_not_zip: ["不是有效的 zip 文件", "Not a valid zip file"],
  e_not_mnemosyne: ["不是有效的 Mnemosyne 文件", "Not a valid Mnemosyne file"], e_not_supermemo: ["不是有效的 SuperMemo XML", "Not a valid SuperMemo XML"],
  e_invalid_xml: ["XML 格式错误", "Malformed XML"], e_nothing: ["没有识别到任何卡片", "No cards found"],
} as const;

export type ImportKey = keyof typeof IMPORT_DICT;

export function ti(locale: Locale, key: ImportKey | string, vars?: Record<string, string | number>): string {
  const e = (IMPORT_DICT as Record<string, readonly [string, string]>)[key];
  let s = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Translated message for an import parser error code, or null when it is not an import error. */
export function importErrorMessage(locale: Locale, e: unknown): string | null {
  const code = e instanceof Error ? e.message : "";
  const key = `e_${code}`;
  return key in IMPORT_DICT ? ti(locale, key) : null;
}
