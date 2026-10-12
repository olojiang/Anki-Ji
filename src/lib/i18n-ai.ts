/** Strings for AI card generation, TTS and voice recording: [中文, English]. Separate from the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const AI_DICT = {
  navAi: ["AI 生成", "AI cards"],
  // settings: provider
  aiSettingsTitle: ["AI 服务（自带密钥）", "AI provider (bring your own key)"],
  aiSettingsDesc: ["用你自己的 API Key 生成卡片。密钥在服务器端加密保存，不会再显示或发回浏览器。", "Generate cards with your own API key. The key is encrypted on the server and never shown or sent back to the browser."],
  aiProvider: ["服务商", "Provider"], aiBaseUrl: ["接口地址 (Base URL)", "Base URL"], aiModel: ["模型", "Model"], aiKey: ["API Key", "API key"],
  aiKeyPh: ["粘贴新的 API Key", "Paste a new API key"],
  aiKeySaved: ["已保存 ••••{last4}（留空则保持不变）", "Saved ••••{last4} (leave blank to keep)"],
  aiKeyNone: ["尚未保存密钥", "No key saved"],
  aiKeyOptional: ["本地 / 自建服务可留空", "Optional for local / self-hosted servers"],
  aiGetKey: ["获取密钥", "Get a key"],
  aiSave: ["保存", "Save"], aiTest: ["测试连接", "Test connection"], aiRemoveKey: ["删除密钥", "Remove key"], aiReset: ["清除配置", "Clear settings"],
  aiTestOk: ["连接成功：{model}", "Connected: {model}"],
  aiOllamaHint: ["Ollama 需要服务器能访问到它：线上部署无法连接你电脑上的 localhost，请在自建 / 本地运行的 Anki-ji 中使用，或通过公网地址暴露。", "The server must be able to reach Ollama: the hosted app cannot connect to localhost on your computer — use it with a self-hosted/local Anki-ji, or expose Ollama on a public URL."],
  aiNotConfigured: ["还没有配置 AI 服务。", "No AI provider configured yet."],
  aiGoSettings: ["去设置", "Open settings"],
  // generator
  aiTitle: ["AI 生成卡片", "Generate cards with AI"],
  aiSubtitle: ["粘贴文本、上传 PDF 或输入网址，AI 生成卡片后先勾选、编辑再导入", "Paste text, upload a PDF or enter a URL — review, tick and edit the cards before importing"],
  srcText: ["粘贴文本", "Paste text"], srcFile: ["PDF / 文本文件", "PDF / text file"], srcUrl: ["网址", "URL"],
  srcTextPh: ["粘贴学习材料（笔记、文章、教材段落…）", "Paste study material (notes, an article, a textbook passage…)"],
  srcFileHint: ["支持 .pdf（含文字层）、.txt、.md，最大 4 MB。扫描版 PDF 请先 OCR 或直接粘贴文字。", ".pdf (with a text layer), .txt, .md up to 4 MB. For scanned PDFs, OCR first or paste the text."],
  srcChoose: ["选择或拖入文件", "Choose or drop a file"],
  srcUrlPh: ["https://…（文章、维基百科、文档页面）", "https://… (article, Wikipedia, docs page)"],
  srcFetch: ["抓取正文", "Fetch text"], srcExtracting: ["正在提取文字…", "Extracting text…"],
  srcChars: ["{n} 字符", "{n} characters"], srcParts: ["将分 {n} 段生成", "will be generated in {n} parts"],
  srcExtracted: ["已提取：{title}", "Extracted: {title}"],
  optStyle: ["卡片类型", "Card style"], styleQa: ["问答", "Q&A"], styleCloze: ["填空", "Cloze"], styleMixed: ["混合", "Mixed"],
  optCount: ["数量", "Count"], optLanguage: ["语言", "Language"], langAuto: ["跟随原文", "Same as source"],
  optDeck: ["目标牌组", "Target deck"], optTags: ["标签", "Tags"], optReverse: ["问答卡同时生成反向卡", "Also add reverse cards for Q&A"],
  optInstructions: ["额外要求（可选）", "Extra instructions (optional)"], optInstructionsPh: ["例如：侧重定义和公式；答案尽量简短", "e.g. focus on definitions and formulas; keep answers short"],
  generate: ["生成卡片", "Generate cards"], generating: ["正在生成 {i}/{n}…", "Generating {i}/{n}…"], stop: ["停止", "Stop"],
  retrying: ["请求过于频繁，{s} 秒后重试…", "Rate limited — retrying in {s}s…"],
  // review
  reviewTitle: ["检查并编辑", "Review & edit"],
  reviewDesc: ["勾选要导入的卡片，可直接修改内容", "Tick the cards to import; edit any field inline"],
  selected: ["已选 {n}/{total}", "{n}/{total} selected"], selectAll: ["全选", "Select all"], selectNone: ["全不选", "Select none"],
  qaFront: ["问题", "Question"], qaBack: ["答案", "Answer"], clozeText: ["填空文本", "Cloze text"], clozeExtra: ["补充", "Extra"],
  kindQa: ["问答", "Q&A"], kindCloze: ["填空", "Cloze"], removeCard: ["删除", "Remove"],
  noClozeWarn: ["缺少 {{c1::…}}，将无法导入", "Missing {{c1::…}} — won't import"],
  importSelected: ["导入所选 {n} 张", "Import {n} selected"], discard: ["清空结果", "Discard"],
  aiImportDone: ["已导入 {notes} 条笔记（{cards} 张卡片），跳过 {skipped} 条重复", "Imported {notes} notes ({cards} cards), skipped {skipped} duplicates"],
  partFailed: ["第 {i} 段失败：{msg}", "Part {i} failed: {msg}"],
  // errors
  e_ai_not_configured: ["请先在设置中配置 AI 服务", "Configure an AI provider in Settings first"],
  e_ai_key_required: ["该服务商需要 API Key", "This provider needs an API key"],
  e_ai_bad_key: ["API Key 无效或没有权限", "The API key is invalid or not authorised"],
  e_ai_quota: ["额度不足或欠费，请检查服务商账户", "Out of credit / quota — check your provider account"],
  e_ai_rate_limited: ["请求过于频繁（限流），请稍后再试", "Rate limited by the provider — try again shortly"],
  e_ai_model_not_found: ["找不到该模型，请检查模型名称", "Model not found — check the model name"],
  e_ai_input_too_long: ["内容超过模型上下文长度，请减少文本", "Input exceeds the model's context window — shorten the text"],
  e_ai_bad_request: ["服务商拒绝了请求，请检查接口地址和模型", "The provider rejected the request — check base URL and model"],
  e_ai_provider_error: ["服务商暂时出错，请稍后再试", "Provider error — try again later"],
  e_ai_unreachable: ["无法连接到接口地址", "Cannot reach the base URL"],
  e_ai_timeout: ["请求超时，请减少数量或文本后重试", "Timed out — try fewer cards or less text"],
  e_ai_empty_response: ["模型没有返回内容", "The model returned nothing"],
  e_ai_bad_json: ["模型返回的格式无法解析，请重试或换一个模型", "Couldn't parse the model's answer — retry or try another model"],
  e_ai_no_cards: ["没有生成任何卡片", "No cards were generated"],
  e_ai_key_unreadable: ["保存的密钥无法解密（服务器密钥已变更），请重新输入", "Saved key can't be decrypted (server secret changed) — enter it again"],
  e_ai_invalid_base_url: ["接口地址无效", "Invalid base URL"], e_ai_invalid_provider: ["未知服务商", "Unknown provider"],
  e_ai_model_required: ["请填写模型", "Model is required"], e_ai_invalid_key: ["API Key 格式不正确", "Malformed API key"],
  e_url_not_allowed: ["出于安全原因，不能访问内网 / 本机地址", "For security, private / local addresses are not allowed"],
  e_invalid_url: ["网址无效", "Invalid URL"], e_url_required: ["请输入网址", "Enter a URL"],
  e_url_unreachable: ["无法访问该网址", "Couldn't reach that URL"], e_url_forbidden: ["该网站拒绝访问（可能需要登录）", "The site refused access (login required?)"],
  e_url_fetch_failed: ["抓取网页失败", "Failed to fetch the page"], e_url_no_text: ["页面中没有找到正文", "No readable text found on the page"],
  e_source_too_large: ["文件超过 4 MB", "File is larger than 4 MB"], e_unsupported_source: ["不支持的文件类型", "Unsupported file type"],
  e_not_pdf: ["不是有效的 PDF", "Not a valid PDF"], e_pdf_encrypted: ["PDF 已加密，无法读取", "The PDF is encrypted"],
  e_pdf_no_text: ["PDF 中没有可提取的文字（可能是扫描件）", "No extractable text in this PDF (scanned?)"],
  e_text_required: ["请先提供文本", "Provide some text first"], e_text_too_long: ["单段文本过长", "Text chunk too long"],
  // TTS
  ttsTitle: ["朗读（TTS）", "Read aloud (TTS)"],
  ttsDesc: ["用浏览器语音朗读卡片。可按牌组或笔记类型单独设置；学习时按 R 重读。", "Read cards with your browser's speech engine. Override per deck or note type; press R while studying to replay."],
  ttsUnsupported: ["当前浏览器不支持语音朗读", "This browser does not support speech synthesis"],
  ttsAutoFront: ["自动朗读正面", "Auto-read front"], ttsAutoBack: ["显示答案后自动朗读背面", "Auto-read back when revealed"],
  ttsFrontLang: ["正面语言", "Front language"], ttsBackLang: ["背面语言", "Back language"],
  ttsFrontVoice: ["正面声音", "Front voice"], ttsBackVoice: ["背面声音", "Back voice"], ttsVoiceAuto: ["自动（按语言匹配）", "Auto (match language)"],
  ttsRate: ["语速 {r}×", "Rate {r}×"], ttsPreview: ["试听", "Preview"],
  ttsSample: ["这是一段朗读示例。This is a sample sentence.", "This is a sample sentence. 这是一段朗读示例。"],
  ttsScope: ["适用范围", "Applies to"], ttsDefault: ["默认（所有卡片）", "Default (all cards)"], ttsForType: ["笔记类型：{type}", "Note type: {type}"],
  ttsCustom: ["为此单独设置", "Custom settings here"], ttsInherit: ["未单独设置时沿用：牌组（含上级牌组）→ 笔记类型 → 默认", "Without overrides: deck (incl. parent decks) → note type → default"],
  ttsDeckTitle: ["朗读 / 录音", "Read aloud / recording"], ttsSaved: ["朗读设置已保存", "TTS settings saved"],
  ttsMarkers: ["字段中可写 {{tts en_US:apple}} 指定某段文字的朗读语言（显示为 apple）", "Use {{tts en_US:apple}} inside a field to set the language for that text (shown as apple)"],
  speakFront: ["朗读 (R)", "Read aloud (R)"], stopSpeak: ["停止朗读", "Stop"],
  // recording
  recTitle: ["跟读录音", "Record & compare"], record: ["录音", "Record"], recStop: ["停止", "Stop"],
  recPlayMine: ["播放我的录音", "Play my recording"], recPlayCard: ["播放卡片音频", "Play card audio"], recCompare: ["对比（先原音后录音）", "Compare (card, then mine)"],
  recSpeakCard: ["朗读卡片", "Speak card"], recAttach: ["插入到字段", "Insert into field"], recDiscard: ["丢弃", "Discard"],
  recDenied: ["无法使用麦克风：请允许麦克风权限", "Microphone unavailable — please allow microphone access"],
  recUnsupported: ["当前浏览器不支持录音", "Recording is not supported in this browser"],
  recTooLarge: ["录音超过 4 MB，请录短一些", "Recording exceeds 4 MB — keep it shorter"],
  recNoCardAudio: ["卡片没有音频，将用 TTS 朗读作为对比", "No card audio — TTS will be used for comparison"],
  recAttached: ["录音已插入", "Recording inserted"], recording: ["录音中 {s}s", "Recording {s}s"],
} as const;

export type AiKey = keyof typeof AI_DICT;

export function ta(locale: Locale, key: AiKey | string, vars?: Record<string, string | number>): string {
  const e = (AI_DICT as Record<string, readonly [string, string]>)[key];
  let s = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Translated message for an AI / source error code, or null when it is not one of ours. */
export function aiErrorMessage(locale: Locale, e: unknown): string | null {
  const code = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const key = `e_${code}`;
  return key in AI_DICT ? ta(locale, key) : null;
}
