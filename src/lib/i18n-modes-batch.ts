/** Strings for study modes (Test / Match / Spell) and Browse batch editing: [中文, English]. Separate from the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const MB_DICT = {
  // study modes
  back: ["返回", "Back"], cancel: ["取消", "Cancel"], close: ["关闭", "Close"],
  modes: ["学习模式", "Study modes"], modesHint: ["临时突击练习，不影响记忆调度与复习记录", "Cram practice — never affects scheduling or review history"],
  modeTest: ["测验", "Test"], modeMatch: ["配对", "Match"], modeSpell: ["拼写", "Spell"],
  modeTestDesc: ["选择题、判断题、填写题混合出题", "Mixed multiple choice, true/false and written questions"],
  modeMatchDesc: ["把问题与答案配对，越快越好", "Match prompts to answers against the clock"],
  modeSpellDesc: ["输入答案，逐字比对，错的反复练到对", "Type the answer, see a letter diff, retry until right"],
  dirForward: ["正面 → 背面", "Front → Back"], dirReverse: ["背面 → 正面", "Back → Front"], dirBoth: ["双向", "Both"],
  itemsN: ["{n} 张可用卡片", "{n} usable cards"], noItems: ["这里没有可用于练习的卡片（图片遮挡等题型会被跳过）", "No cards usable here (image occlusion etc. are skipped)"],
  selection: ["已选题目", "Selection"], searchSel: ["搜索：{q}", "Search: {q}"],
  start: ["开始", "Start"], restart: ["再来一次", "Play again"], best: ["最佳", "Best"], plays: ["{n} 次", "{n} plays"], newBest: ["新纪录！", "New best!"],
  // test
  qCount: ["题目数量", "Questions"], qKinds: ["题型", "Question types"], kindMc: ["选择题", "Multiple choice"], kindTf: ["判断题", "True / False"], kindWritten: ["填写题", "Written"],
  questionN: ["第 {i} / {n} 题", "Question {i} of {n}"], tfTrue: ["正确", "True"], tfFalse: ["错误", "False"], tfQ: ["这个答案对吗？", "Is this the right answer?"],
  writtenPh: ["输入答案，回车提交", "Type the answer, press Enter"], submit: ["提交", "Submit"], skip: ["跳过", "Skip"], prev: ["上一题", "Previous"], next: ["下一题", "Next"],
  finish: ["交卷", "Finish"], unanswered: ["还有 {n} 题未作答，确定交卷？", "{n} unanswered. Finish anyway?"],
  score: ["得分", "Score"], correctOf: ["答对 {c} / {n}", "{c} of {n} correct"], mistakes: ["错题回顾", "Review mistakes"], noMistakes: ["全部正确，太棒了！", "All correct — great job!"],
  retakeMistakes: ["只练错题", "Retest mistakes"], retake: ["重新测验", "Retake"], newTest: ["新测验", "New test"], yourAns: ["你的答案", "Your answer"], rightAns: ["正确答案", "Correct answer"],
  noAnswer: ["（未作答）", "(no answer)"], closeEnough: ["拼写有小误差，算对", "Minor typo — counted correct"],
  keysTest: ["快捷键：1–4 选择 · T/F 判断 · ← → 切换题目", "Keys: 1–4 choose · T/F true/false · ← → navigate"],
  // match
  matchTime: ["用时", "Time"], penalty: ["配错 +1 秒", "+1s per miss"], misses: ["配错 {n} 次", "{n} misses"], matchDone: ["完成！", "Done!"], pairsN: ["{n} 对", "{n} pairs"],
  matchHint: ["点一个问题，再点它的答案", "Tap a prompt, then its answer"],
  // spell
  spellPh: ["输入答案，回车检查", "Type the answer, Enter to check"], check: ["检查", "Check"], continue: ["继续", "Continue"],
  spellRight: ["正确！", "Correct!"], spellWrong: ["不对，稍后再练一次", "Not quite — it'll come back"], spellClose: ["差一点，注意拼写", "Almost — mind the spelling"],
  progress: ["已掌握 {d} / {n}", "{d} of {n} mastered"], firstTry: ["一次答对率", "First-try accuracy"], missedList: ["曾答错", "Missed at least once"],
  reveal: ["不会，看答案", "Don't know"], attempts: ["{n} 次", "{n} tries"],
  // batch
  batch: ["批量编辑", "Batch edit"], findReplace: ["查找替换", "Find & replace"], duplicates: ["查找重复", "Find duplicates"], changeType: ["更改题型", "Change note type"],
  find: ["查找", "Find"], replaceWith: ["替换为", "Replace with"], inFields: ["范围（字段）", "In fields"], allFields: ["全部字段", "All fields"],
  regex: ["正则表达式", "Regular expression"], caseSensitive: ["区分大小写", "Match case"],
  scopeSelected: ["已选 {n} 条", "{n} selected"], scopeResults: ["全部搜索结果（{n} 条）", "All search results ({n})"], applyTo: ["应用于", "Apply to"],
  previewCount: ["将在 {notes} 条题目中替换 {m} 处", "{m} matches in {notes} notes"], previewNone: ["没有匹配", "No matches"],
  replaceAll: ["全部替换", "Replace all"], replacedN: ["已替换 {m} 处（{n} 条题目）", "Replaced {m} matches in {n} notes"], skippedN: ["{n} 条因替换后无效而跳过", "{n} skipped (would become invalid)"],
  undoLast: ["撤销", "Undo"], undone: ["已撤销", "Undone"], regexHelp: ["正则模式下可用 $1、$2 引用分组", "In regex mode use $1, $2 for groups"],
  f_front: ["正面", "Front"], f_back: ["背面", "Back"], f_text: ["填空文本", "Cloze text"], f_extra: ["额外", "Extra"], f_question: ["题干", "Question"], f_options: ["选项", "Options"],
  f_explanation: ["解析", "Explanation"], f_header: ["标题", "Header"], f_custom: ["自定义类型字段", "Custom type fields"], f_empty: ["（留空）", "(empty)"],
  dupScope: ["比较范围", "Compare within"], dupDeck: ["同一牌组", "Same deck"], dupType: ["同一题型", "Same note type"], dupCollection: ["整个题库", "Whole collection"],
  dupIn: ["查找位置", "Look in"], dupAllDecks: ["所有牌组", "All decks"], dupResults: ["当前搜索结果", "Current search results"], scan: ["查找", "Scan"],
  dupGroups: ["{n} 组重复", "{n} duplicate groups"], dupNone: ["没有发现重复（按第一个字段比较，忽略大小写、空格和 HTML）", "No duplicates (first field, ignoring case, spacing and HTML)"],
  keep: ["保留", "Keep"], merge: ["合并", "Merge"], mergeAll: ["全部合并", "Merge all"], deleteOthers: ["删除其他", "Delete others"],
  schedBest: ["采用复习进度最多的调度", "Adopt the most-reviewed scheduling"], schedKeep: ["保留所选题目的调度", "Keep the kept note's scheduling"],
  mergeHint: ["合并：保留所选题目，合并全部标签，其余移入回收站", "Merge keeps the selected note, unions tags, moves the others to the trash"],
  mergedN: ["已合并 {n} 组", "Merged {n} groups"], deletedN: ["已删除 {n} 条", "Deleted {n} notes"], reps: ["复习 {n} 次", "{n} reviews"],
  targetType: ["新题型", "New type"], fieldMap: ["字段对应", "Field mapping"], fromField: ["来源字段", "From"], toField: ["新字段", "To"],
  ctPreview: ["{n} 条可转换 · 新增 {a} 张卡片 · 删除 {r} 张卡片", "{n} convertible · {a} cards added · {r} cards removed"],
  ctRemoveWarn: ["被删除的卡片会丢失复习记录（可撤销）", "Removed cards lose their review history (undoable)"],
  ctClozeWarn: ["填空卡片的编号与其他题型不同，转换后卡片将重新开始学习", "Cloze cards are numbered differently; converted cards start as new"],
  ctMixed: ["所选题目的题型不一致，请只选择同一种题型", "Selected notes have different types — select one type at a time"],
  ctUnsupported: ["该题型暂不支持转换（仅基础 / 正反向 / 可选反向 / 输入作答 / 填空）", "This type can't be converted (only Basic / reverse / optional reverse / typed / cloze)"],
  ctDone: ["已转换 {n} 条题目", "Converted {n} notes"], ctSkipped: ["{n} 条不满足新题型要求，已跳过", "{n} skipped (invalid for the new type)"],
  convert: ["转换", "Convert"], selectFirst: ["请先选择题目", "Select notes first"],
  e_invalid_regex: ["正则表达式无效", "Invalid regular expression"], e_empty_find: ["请输入要查找的内容", "Enter text to find"], e_mixed_types: ["所选题目的题型不一致", "Selected notes have different types"],
  e_unsupported_conversion: ["不支持这种题型转换", "Unsupported conversion"], e_invalid_mapping: ["字段对应无效", "Invalid field mapping"], e_undo_not_found: ["撤销记录已失效", "Nothing to undo"],
} as const;

export type MBKey = keyof typeof MB_DICT;

export function tm(locale: Locale, key: MBKey | string, vars?: Record<string, string | number>): string {
  const e = (MB_DICT as Record<string, readonly [string, string]>)[key];
  let s = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Translated message for a batch/mode error code, or null. */
export function mbErrorMessage(locale: Locale, e: unknown): string | null {
  const code = e instanceof Error ? e.message : "";
  return `e_${code}` in MB_DICT ? tm(locale, `e_${code}`) : null;
}
