/** UI strings: [中文, English]. Chinese is the default locale. */
export const DICT = {
  appName: ["Anki-ji", "Anki-ji"],
  tagline: ["基于 FSRS-6 的在线间隔重复记忆卡片", "Online spaced repetition powered by FSRS-6"],
  // nav
  navDecks: ["牌组", "Decks"], navAdd: ["添加", "Add"], navBrowse: ["浏览", "Browse"], navStats: ["统计", "Stats"], navTags: ["标签", "Tags"],
  navIO: ["导入导出", "Import / Export"], navTrash: ["回收站", "Trash"], navSettings: ["设置", "Settings"], logout: ["退出登录", "Log out"],
  // auth
  login: ["登录", "Log in"], register: ["注册", "Sign up"], email: ["邮箱", "Email"], password: ["密码", "Password"], name: ["昵称", "Name"],
  noAccount: ["还没有账号？", "No account yet?"], haveAccount: ["已有账号？", "Already have an account?"], createAccount: ["创建账号", "Create account"],
  welcomeBack: ["欢迎回来", "Welcome back"], loginSub: ["登录以继续今天的复习", "Log in to continue today's reviews"], registerSub: ["免费创建账号，数据随时可导出", "Free account. Export your data any time."],
  passwordHint: ["至少 8 位", "At least 8 characters"],
  heroPoint1: ["FSRS-6 官方实现（ts-fsrs），可用你的复习记录训练参数", "Official FSRS-6 (ts-fsrs), trainable on your own reviews"],
  heroPoint2: ["无限层级牌组、填空、选择题、图片遮挡、Markdown 与公式", "Unlimited nested decks, cloze, MCQ, image occlusion, Markdown & math"],
  heroPoint3: ["完整 JSON 备份、CSV/TSV、Anki .apkg 导入", "Full JSON backup, CSV/TSV, Anki .apkg import"],
  // common
  save: ["保存", "Save"], cancel: ["取消", "Cancel"], delete: ["删除", "Delete"], edit: ["编辑", "Edit"], create: ["创建", "Create"], rename: ["重命名", "Rename"],
  close: ["关闭", "Close"], confirm: ["确认", "Confirm"], loading: ["加载中…", "Loading…"], saved: ["已保存", "Saved"], search: ["搜索", "Search"], none: ["无", "None"],
  restore: ["恢复", "Restore"], purge: ["彻底删除", "Delete forever"], apply: ["应用", "Apply"], back: ["返回", "Back"], more: ["更多", "More"], all: ["全部", "All"],
  optional: ["可选", "optional"], yes: ["是", "Yes"], no: ["否", "No"], done: ["完成", "Done"], error: ["出错了", "Something went wrong"],
  // decks
  decks: ["牌组", "Decks"], newDeck: ["新建牌组", "New deck"], newSubdeck: ["新建子牌组", "New sub-deck"], deckName: ["牌组名称", "Deck name"],
  filteredDeck: ["自定义学习", "Custom study"], newFilteredDeck: ["新建自定义学习牌组", "New custom study deck"],
  colNew: ["新卡", "New"], colLearn: ["学习中", "Learn"], colDue: ["待复习", "Due"], study: ["学习", "Study"], options: ["选项", "Options"],
  rebuild: ["重建", "Rebuild"], emptyDeck: ["清空", "Empty"], deleteDeckQ: ["将牌组“{name}”及其子牌组移入回收站？", "Move deck “{name}” and its sub-decks to the trash?"],
  dragHint: ["拖动牌组可排序；拖到另一个牌组中间可设为其子牌组", "Drag to reorder; drop onto the middle of a deck to nest it"],
  noDecks: ["还没有牌组，先创建一个吧", "No decks yet — create one"], todayDone: ["今日已完成 {n} 张", "{n} reviewed today"], streakDays: ["连续 {n} 天", "{n}-day streak"],
  moveToRoot: ["移到顶层", "Move to top level"], filterQuery: ["搜索条件", "Search query"], filterLimit: ["最多卡片数", "Card limit"], filterOrder: ["排序", "Order"],
  orderDue: ["到期时间", "Due date"], orderRandom: ["随机", "Random"], orderAdded: ["最近添加", "Recently added"], orderRetr: ["最易遗忘优先", "Lowest retrievability"],
  filterExamples: ["例：is:due deck:日语  ·  tag:难点  ·  prop:due<=3（提前复习三天内到期）", "e.g. is:due deck:Japanese · tag:hard · prop:due<=3 (review ahead)"],
  // study
  showAnswer: ["显示答案", "Show answer"], again: ["重来", "Again"], hard: ["困难", "Hard"], good: ["良好", "Good"], easy: ["简单", "Easy"],
  undo: ["撤销", "Undo"], suspend: ["暂停", "Suspend"], bury: ["埋藏", "Bury"], buryNote: ["埋藏笔记", "Bury note"], flag: ["标记", "Flag"],
  congrats: ["太棒了！这个牌组今天的任务完成了", "Congratulations! You're done with this deck for now"],
  comeBack: ["还有学习中的卡片，{t} 后再来", "Learning cards will be due in {t}"], backToDecks: ["回到牌组", "Back to decks"],
  typeAnswerPh: ["输入答案后回车", "Type the answer, then Enter"], yourAnswer: ["你的答案", "Your answer"], correctAnswer: ["正确答案", "Correct answer"],
  choose: ["选择后点击“显示答案”", "Pick, then show the answer"], correctPick: ["回答正确", "Correct"], wrongPick: ["回答错误", "Incorrect"],
  shortcuts: ["快捷键：空格 显示/良好 · 1–4 评分 · Z 撤销 · E 编辑 · S 暂停 · B 埋藏 · F 标记", "Keys: Space show/good · 1–4 rate · Z undo · E edit · S suspend · B bury · F flag"],
  leechNotice: ["这张卡片被标记为“顽固卡（leech）”", "This card became a leech"], retrievability: ["可提取性", "Retrievability"], stability: ["稳定性", "Stability"], difficulty: ["难度", "Difficulty"],
  // editor
  addNote: ["添加题目", "Add note"], editNote: ["编辑题目", "Edit note"], noteType: ["题型", "Note type"], deck: ["牌组", "Deck"], tags: ["标签", "Tags"],
  tagsPh: ["空格分隔，层级用 ::，如 日语::N5", "Space separated, use :: for hierarchy"], added: ["已添加", "Added"], addAndNext: ["添加", "Add"],
  front: ["正面", "Front"], backSide: ["背面", "Back"], text: ["文本", "Text"], extra: ["补充说明", "Extra"], question: ["题干", "Question"], options_: ["选项", "Options"],
  explanation: ["解析", "Explanation"], addOption: ["添加选项", "Add option"], correctMark: ["正确", "Correct"], image: ["图片", "Image"], header: ["标题", "Header"],
  addReverse: ["同时生成反向卡片", "Also create reverse card"], preview: ["预览", "Preview"], uploadImage: ["上传图片", "Upload image"], uploadAudio: ["上传音频", "Upload audio"],
  clozeBtn: ["填空", "Cloze"], clozeHelp: ["选中文字后点“填空”或按 Ctrl+Shift+C；{{c1::答案::提示}}", "Select text then Cloze (Ctrl+Shift+C); {{c1::answer::hint}}"],
  mdHelp: ["支持 Markdown、$公式$、```代码```、粘贴/拖入图片，音频 ![audio](url)，视频链接（YouTube/B站）", "Markdown, $math$, ```code```, paste/drop images, audio ![audio](url), video links"],
  occlusionHelp: ["上传图片后在图上拖拽画出遮挡区域，每个区域生成一张卡片", "Upload an image, then drag on it to draw masks — one card per mask"],
  hideOne: ["只遮挡当前区域", "Hide one, guess one"], hideAll: ["遮挡全部，猜一个", "Hide all, guess one"], clearMasks: ["清除全部遮挡", "Clear masks"],
  t_basic: ["基础（正/反）", "Basic"], t_basic_reverse: ["基础 + 反向", "Basic + reverse"], t_basic_optional_reverse: ["基础（可选反向）", "Basic (optional reverse)"],
  t_cloze: ["填空", "Cloze"], t_type_in: ["输入作答", "Type the answer"], t_mcq: ["选择题", "Multiple choice"], t_image_occlusion: ["图片遮挡", "Image occlusion"],
  // browse
  browse: ["浏览", "Browse"], searchPh: ["搜索：deck:日语 tag:动词 is:due -is:suspended \"精确短语\"", "Search: deck:Lang tag:verbs is:due -is:suspended \"exact phrase\""],
  sort: ["排序", "Sort"], sortManual: ["手动顺序", "Manual"], sortCreated: ["创建时间", "Created"], sortDue: ["到期", "Due"], sortField: ["排序字段", "Sort field"],
  sortInterval: ["间隔", "Interval"], sortLapses: ["遗忘次数", "Lapses"], sortDifficulty: ["难度", "Difficulty"],
  groupBy: ["分组", "Group by"], groupNone: ["不分组", "None"], groupDeck: ["按牌组", "Deck"], groupTag: ["按标签", "Tag"], groupType: ["按题型", "Type"],
  selected: ["已选 {n} 项", "{n} selected"], moveTo: ["移动到…", "Move to…"], addTagsQ: ["添加标签（空格分隔）", "Add tags (space separated)"], removeTagsQ: ["移除标签（空格分隔）", "Remove tags (space separated)"],
  unsuspend: ["取消暂停", "Unsuspend"], reset: ["重置为新卡", "Forget"], unbury: ["取消埋藏", "Unbury"], results: ["{n} 张卡片", "{n} cards"], notesMode: ["按笔记", "Notes"], cardsMode: ["按卡片", "Cards"],
  colQuestion: ["题目", "Question"], colDeck: ["牌组", "Deck"], colType: ["题型", "Type"], colDueAt: ["到期", "Due"], colIvl: ["间隔", "Interval"], colTags: ["标签", "Tags"],
  syntaxHelp: ["搜索语法", "Search syntax"], history: ["复习记录", "Review history"], cardInfo: ["卡片信息", "Card info"], reps: ["复习次数", "Reviews"], lapses: ["遗忘", "Lapses"],
  stNew: ["新", "New"], stLearning: ["学习", "Learning"], stReview: ["复习", "Review"], stRelearning: ["重学", "Relearning"], suspended: ["已暂停", "Suspended"], buried: ["已埋藏", "Buried"],
  moveUp: ["上移", "Move up"], moveDown: ["下移", "Move down"], dragRows: ["手动顺序下可拖动行或用箭头调整新卡顺序", "In manual order, drag rows or use arrows to set new-card order"],
  // tags
  tagsTitle: ["标签", "Tags"], newTag: ["新建标签", "New tag"], renameTagTo: ["重命名为（会同时修改子标签）", "Rename to (children follow)"], deleteTagQ: ["从所有题目中删除标签“{name}”及其子标签？", "Remove tag “{name}” and its children from all notes?"],
  noTags: ["暂无标签", "No tags yet"], notesCount: ["{n} 个题目", "{n} notes"],
  // stats
  stats: ["统计", "Statistics"], today: ["今天", "Today"], reviewsToday: ["今日复习", "Reviews today"], minutes: ["分钟", "min"], streak: ["连续天数", "Streak"],
  trueRetention: ["真实保留率（30 天）", "True retention (30d)"], target: ["目标", "Target"], forecast: ["未来 30 天到期预测", "30-day forecast"],
  heatmap: ["学习热力图", "Activity"], reviewsLast30: ["近 30 天复习量", "Reviews, last 30 days"], cardStates: ["卡片状态", "Card states"],
  young: ["年轻（<21天）", "Young (<21d)"], mature: ["成熟（≥21天）", "Mature (≥21d)"], totalCards: ["卡片总数", "Total cards"], allDecks: ["全部牌组", "All decks"],
  // io
  ioTitle: ["导入导出", "Import & export"], exportTitle: ["导出", "Export"], importTitle: ["导入", "Import"],
  exportJson: ["完整备份（JSON，含媒体）", "Full backup (JSON, with media)"], exportJsonDesc: ["牌组、题目、卡片、复习记录、标签、设置和图片音频，可在任何账号完整恢复", "Decks, notes, cards, review log, tags, settings and media — restorable into any account"],
  exportCsv: ["CSV", "CSV"], exportTsv: ["TSV", "TSV"], exportCsvDesc: ["题目表格（含 fields_json 列，可无损再导入）", "Notes table (with fields_json column for lossless re-import)"],
  importDesc: ["支持 Anki-ji 备份 .json、CSV/TSV/TXT、Anki .apkg（基础/填空题型）", "Accepts Anki-ji .json backups, CSV/TSV/TXT, Anki .apkg (Basic/Cloze)"],
  chooseFile: ["选择文件", "Choose file"], includeMedia: ["包含图片/音频", "Include media"], defaultDeck: ["默认牌组（文件未指定牌组时）", "Default deck (when the file has none)"], startImport: ["开始导入", "Import"],
  importing: ["正在导入…", "Importing…"], importDone: ["导入完成：{notes} 个题目、{cards} 张卡片，跳过重复 {skipped} 个", "Imported {notes} notes, {cards} cards; skipped {skipped} duplicates"],
  uploadingMedia: ["上传媒体 {i}/{n}", "Uploading media {i}/{n}"], parsing: ["解析文件…", "Parsing…"], detected: ["识别到 {notes} 个题目，{decks} 个牌组，{media} 个媒体文件", "Found {notes} notes, {decks} decks, {media} media files"],
  csvFormat: ["CSV 格式：首行可为表头（deck/牌组, type/题型, front/正面, back/背面, tags/标签）；无表头时按 正面,背面,标签", "CSV: optional header (deck, type, front, back, tags); otherwise front, back, tags"],
  apkgNote: ["新版 Anki 导出时可勾选“兼容旧版本”以获得最佳兼容性；导入的复习进度为近似转换", "For best results tick “Support older Anki versions” when exporting; scheduling is approximated"],
  // trash
  trashTitle: ["回收站", "Trash"], deletedDecks: ["已删除的牌组", "Deleted decks"], deletedNotes: ["已删除的题目", "Deleted notes"], trashEmpty: ["回收站是空的", "Trash is empty"],
  // settings
  settings: ["设置", "Settings"], language: ["语言", "Language"], theme: ["主题", "Theme"], light: ["浅色", "Light"], dark: ["深色", "Dark"], system: ["跟随系统", "System"],
  timezone: ["时区", "Time zone"], rollover: ["新的一天开始于", "Next day starts at"], rolloverHelp: ["每日计数与到期按此时间切换（默认凌晨 4 点）", "Daily limits and due dates roll over at this hour (default 4am)"],
  changePassword: ["修改密码", "Change password"], currentPassword: ["当前密码", "Current password"], newPassword: ["新密码", "New password"],
  dangerZone: ["危险操作", "Danger zone"], deleteAccount: ["删除账号及全部数据", "Delete account and all data"], deleteAccountQ: ["输入密码确认删除，此操作不可恢复（建议先导出备份）", "Enter your password to confirm. This cannot be undone (export a backup first)."],
  account: ["账号", "Account"], appearance: ["外观", "Appearance"], studyDay: ["学习日", "Study day"],
  // deck options
  deckOptions: ["牌组选项", "Deck options"], algorithm: ["调度算法", "Scheduler"], algoFsrs: ["FSRS-6（推荐）", "FSRS-6 (recommended)"], algoSm2: ["SM-2（Anki 旧版）", "SM-2 (legacy Anki)"], algoLeitner: ["Leitner 盒子", "Leitner boxes"],
  dailyLimits: ["每日上限", "Daily limits"], newPerDay: ["每日新卡", "New cards/day"], reviewsPerDay: ["每日最多复习", "Maximum reviews/day"],
  steps: ["学习步长", "Steps"], learningSteps: ["学习步长", "Learning steps"], relearningSteps: ["重学步长", "Relearning steps"], stepsHelp: ["空格分隔，如 1m 10m 1d", "Space separated, e.g. 1m 10m 1d"],
  fsrsSection: ["FSRS", "FSRS"], desiredRetention: ["目标保留率", "Desired retention"], retentionHelp: ["越高复习越频繁；推荐 0.85–0.95", "Higher means more reviews; 0.85–0.95 recommended"],
  maxInterval: ["最大间隔（天）", "Maximum interval (days)"], weights: ["FSRS 参数", "FSRS parameters"], defaultWeights: ["使用默认参数", "Using default parameters"],
  optimize: ["用我的复习记录优化参数", "Optimize from my reviews"], optimizing: ["正在训练…", "Training…"], resetWeights: ["恢复默认", "Reset"],
  optimizeDone: ["已基于 {n} 条训练样本更新参数", "Parameters updated from {n} training items"], notEnough: ["复习记录不足（{n}/{need}），继续学习一段时间后再试", "Not enough reviews yet ({n}/{need})"],
  optimizerUnavailable: ["服务器暂不可用优化器，已保留默认参数", "Optimizer unavailable on the server; defaults kept"],
  sm2Section: ["SM-2 参数", "SM-2 settings"], graduatingInterval: ["毕业间隔（天）", "Graduating interval (days)"], easyInterval: ["简单间隔（天）", "Easy interval (days)"],
  startingEase: ["初始难度系数", "Starting ease"], easyBonus: ["简单奖励", "Easy bonus"], hardIntervalF: ["困难间隔倍数", "Hard interval"], intervalModifier: ["间隔修饰", "Interval modifier"],
  lapseNew: ["遗忘后新间隔（比例）", "New interval after lapse"], leitnerSection: ["Leitner 盒子间隔（天）", "Leitner box intervals (days)"],
  burySection: ["埋藏兄弟卡", "Burying"], buryNew: ["埋藏新卡的兄弟卡", "Bury new siblings"], buryReview: ["埋藏复习卡的兄弟卡", "Bury review siblings"],
  leechSection: ["顽固卡（Leech）", "Leeches"], leechThreshold: ["遗忘次数阈值", "Leech threshold"], leechAction: ["处理方式", "Leech action"], leechSuspend: ["暂停并打标签", "Suspend + tag"], leechTag: ["仅打标签", "Tag only"],
  orderSection: ["显示顺序", "Display order"], newOrder: ["新卡顺序", "New card order"], newManual: ["手动顺序", "Manual"], newCreated: ["创建时间", "Created"], newRandom: ["随机", "Random"],
  reviewOrder: ["复习顺序", "Review order"], revDue: ["到期日，再按可提取性", "Due date, then retrievability"], revRetr: ["可提取性（最易忘先）", "Retrievability ascending"], revRandom: ["随机", "Random"],
  mix: ["新卡与复习", "New/review mix"], mixMix: ["混合穿插", "Mix"], mixNewFirst: ["先新卡", "New first"], mixReviewFirst: ["先复习", "Reviews first"],
  balanceSection: ["负载均衡与轻松日", "Load balancing & easy days"], fuzz: ["间隔随机扰动（fuzz）", "Interval fuzz"], loadBalance: ["负载均衡（平滑每日复习量）", "Load balancer (smooth daily load)"],
  easyDays: ["轻松日（减少当天复习）", "Easy days (lighter days)"], normal: ["正常", "Normal"], reduced: ["减少", "Reduced"], minimum: ["最少", "Minimum"],
  learnAhead: ["提前学习限制（分钟）", "Learn-ahead limit (min)"], applyToChildren: ["同时应用到所有子牌组", "Also apply to all sub-decks"],
  weekdays: ["日,一,二,三,四,五,六", "Sun,Mon,Tue,Wed,Thu,Fri,Sat"],
  // errors
  e_invalid_credentials: ["邮箱或密码错误", "Wrong email or password"], e_email_taken: ["该邮箱已注册", "Email already registered"], e_invalid_email: ["邮箱格式不正确", "Invalid email"],
  e_password_too_short: ["密码至少 8 位", "Password must be at least 8 characters"], e_front_required: ["请填写正面", "Front is required"], e_text_required: ["请填写文本", "Text is required"],
  e_cloze_required: ["文本中至少需要一个填空 {{c1::…}}", "Add at least one cloze {{c1::…}}"], e_question_required: ["请填写题干", "Question is required"],
  e_options_required: ["至少需要两个选项", "At least two options"], e_correct_required: ["请勾选正确选项", "Mark the correct option"], e_image_required: ["请上传图片", "Upload an image"],
  e_masks_required: ["请至少画一个遮挡区域", "Draw at least one mask"], e_file_too_large: ["文件过大（上限 4MB）", "File too large (max 4MB)"], e_deck_is_filtered: ["不能直接向自定义学习牌组添加题目", "Can't add notes to a custom study deck"],
  e_invalid_move: ["不能把牌组移动到它自己的子牌组里", "Can't move a deck into its own sub-deck"], e_name_required: ["请输入名称", "Name is required"], e_invalid_backup: ["不是有效的 Anki-ji 备份文件", "Not a valid Anki-ji backup"],
  e_not_apkg: ["不是有效的 Anki 包（.apkg）", "Not a valid Anki package"], e_unauthorized: ["请先登录", "Please log in"],
} as const;

export type DictKey = keyof typeof DICT;
export type Locale = "zh" | "en";

export function translate(locale: Locale, key: DictKey | string, vars?: Record<string, string | number>): string {
  const entry = (DICT as Record<string, readonly [string, string]>)[key];
  let s = entry ? entry[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
