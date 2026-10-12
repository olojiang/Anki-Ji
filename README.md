# Anki-ji · 在线间隔重复记忆卡片

基于 **FSRS-6**（官方 `ts-fsrs` 实现）的在线 Anki 式记忆卡片应用：注册登录、无限层级牌组、多种题型（文本 / 图片 / 音频 / 公式 / 代码）、经过验证的复习调度、完整的导入导出与统计。界面默认中文，可切换英文，支持浅色 / 深色主题。

- 线上地址：https://anki-ji.vercel.app
- 技术栈：Next.js 15（App Router）+ TypeScript + Tailwind · Neon Postgres（`@neondatabase/serverless`）· Vercel Blob · bcryptjs + jose（JWT HttpOnly Cookie）· Vitest

---

## 功能一览

| 模块 | 内容 |
|---|---|
| 账号 | 邮箱 + 密码注册登录（bcrypt 哈希，30 天 JWT HttpOnly Cookie），修改密码，删除账号（连同全部数据与媒体） |
| 牌组 | 无限层级（父 / 子 / 孙…），拖拽排序与拖入设为子牌组，重命名、移动、删除到回收站、恢复、彻底删除；每个牌组独立选项，可一键应用到子牌组 |
| 题型 | 基础（正 / 反）、基础 + 反向、可选反向、填空（`{{c1::答案::提示}}`，支持嵌套）、输入作答（逐字比对）、选择题（单选 / 多选）、图片遮挡（拖拽画遮挡框，“只遮当前 / 全遮猜一个”） |
| 富内容 | Markdown、KaTeX 公式（`$…$` / `$$…$$`）、代码高亮、图片 / 音频上传（Vercel Blob，粘贴或拖入即可）、YouTube / B 站视频链接自动嵌入；全部经 DOMPurify 净化 |
| 排序与分组 | 题目手动排序（拖动行或上下箭头，决定新卡顺序）、按创建时间 / 到期 / 间隔 / 遗忘次数 / 难度排序；浏览器按牌组 / 标签 / 题型分组；牌组本身即无限嵌套的分组 |
| 标签 | 层级标签 `a::b`，新建、重命名（子标签随之改名）、删除，按标签筛选 |
| 复习 | 快捷键（空格显示 / 良好、1–4 评分、Z 撤销、E 编辑、S 暂停、B 埋藏、F 标记），四个按钮显示下次间隔，撤销，卡片信息（R / S / D） |
| 调度 | FSRS-6（默认）/ SM-2 / Leitner；每日新卡与复习上限、学习 / 重学步长、提前学习、兄弟卡埋藏、Leech（顽固卡）自动暂停并打标签、间隔扰动 + 负载均衡 + 轻松日、凌晨 4 点（可改）按用户时区切换学习日；FSRS 参数可用自己的复习记录训练 |
| 浏览器 | Anki 风格搜索语法 + 批量操作（移动、加 / 删标签、暂停、标记、重置、删除） |
| 自定义学习 | 按搜索条件建立过滤牌组（如 `is:due prop:due<=3` 提前复习），可重建 / 清空，卡片记住原牌组 |
| 导入导出 | 完整 JSON 备份（牌组、题目、卡片调度、复习记录、标签、设置、**媒体 base64**），CSV / TSV 导出（含 `fields_json` 列可无损再导入），CSV / TSV / TXT 导入（中英文表头自动识别），Anki `.apkg` 导入（基础 / 反向 / 填空，含媒体） |
| 统计 | 今日复习与用时、连续天数、学习热力图、未来 30 天到期预测、近 30 天复习量（学习 / 复习 / 重学）、真实保留率 vs 目标、卡片状态分布、单卡复习历史 |

---

## 架构

```
src/
├─ core/                 纯领域逻辑（无框架、无 DB，100% 单元测试）
│  ├─ types.ts           Rating / SchedState / DeckConfig / NoteFields …
│  ├─ config.ts          牌组选项默认值与校验（唯一的配置校验入口）
│  ├─ time.ts            时区偏移、学习日（day index，凌晨 4 点切换）
│  ├─ scheduler/         统一 Scheduler 接口
│  │  ├─ base.ts         BaseScheduler（preview、可提取性近似）
│  │  ├─ fsrs.ts         FSRS-6：ts-fsrs 适配器
│  │  ├─ sm2.ts          Anki 旧版 SM-2
│  │  └─ leitner.ts      Leitner 盒子
│  ├─ balance.ts         fuzz 范围（复用 ts-fsrs get_fuzz_range）+ 负载均衡 + 轻松日
│  ├─ answer.ts          作答流水线：调度 → 均衡 → 对齐到学习日 → Leech 判定；间隔预览
│  ├─ queue.ts           每日队列：上限（父牌组封顶子牌组）、学习中优先、到期 / 可提取性排序、新卡穿插、兄弟卡埋藏、提前学习
│  ├─ cloze.ts           填空解析（嵌套、提示、多位序号）与渲染
│  ├─ notes.ts           题型 → 卡片序号、渲染、排序字段、校验
│  ├─ search.ts          搜索语法解析器 + 匹配器（永不抛错）
│  ├─ tree.ts            通用有序树：构建、扁平化、后代 / 祖先、防环移动、分数位置、`a::b::c` 路径
│  ├─ stats.ts / optimizer.ts / typed.ts / settings.ts
│  └─ io/                csv.ts · backup.ts（备份信封、重映射、规范化比对）· importer.ts（ImportSink 端口）· apkg.ts · base64.ts
├─ server/               薄 DB 仓储层 + 服务层（每条 SQL 都带 user_id 条件）
│  ├─ db.ts              唯一查询入口 q()，建表（ak_ 前缀），测试可替换为 PGlite
│  ├─ auth.ts / http.ts  密码、JWT、路由包装（鉴权 + 错误映射）
│  ├─ repo/              users · decks · notes · cards · revlog · tags · mappers
│  └─ services/          study · browse · backup（Postgres ImportSink）· filtered · stats · optimizer
├─ app/                  页面（薄 UI）与 /api 路由（薄控制器）
├─ components/ lib/      UI 组件、i18n 词典、Markdown 渲染、导入导出客户端流程
tests/                   Vitest（核心逻辑 + 真 Postgres(PGlite) 的仓储 / 隔离测试）
scripts/smoke.mjs        线上端到端冒烟测试
```

**复用原则**：调度、队列、搜索、填空、树操作、导入导出全部在 `src/core` 中实现一次，服务端和浏览器共用（例如 `.apkg` 在浏览器里解析成与 JSON 备份相同的结构，再走同一条批量导入管线；CSV 也先转成备份结构）。导入管线依赖 `ImportSink` 端口，测试用内存实现，线上用 Postgres 实现（`jsonb_to_recordset` 批量写入）。

**数据隔离**：所有表带 `user_id`，仓储函数第一个参数都是 `uid` 且每条 SQL 都过滤 `user_id`；跨用户访问在测试与线上冒烟中均验证返回 404 / 无效果。

**媒体**：上传到 Vercel Blob（`anki-ji-media` store，单文件 ≤ 4 MB，受 Vercel 函数请求体限制）；本地无 Blob 令牌时退化为 ≤ 1 MB 的 data URL。

---

## 算法说明

### FSRS-6（默认）
- 使用 open-spaced-repetition 官方 `ts-fsrs`（v5，FSRS-6，21 个参数）。测试逐步比对我们的适配器与官方实现的 S / D / 到期时间完全一致，并校验默认初始稳定性 `w0–w3`。
- 可调：目标保留率（0.70–0.99）、最大间隔、学习 / 重学步长（短期调度）、自定义参数。
- 遗忘曲线：`R(t) = (1 + factor · t / S)^(−w20)`；复习卡在 R 降到目标保留率时到期。
- **参数优化**：服务端用官方 `@open-spaced-repetition/binding`（fsrs-rs 的 napi 绑定）从复习日志训练参数。训练样本按 Anki / fsrs-rs 规则构造（每张卡从首次“新卡”复习开始，取每个跨天的前缀），样本少于 32 条时拒绝训练。若运行环境无法加载原生绑定，接口返回 `optimizer_unavailable` 并保留默认参数（不会出错）。

### SM-2（Anki 旧版）
学习步长 → 毕业间隔 / 简单间隔；复习：困难 = 间隔 × 1.2（至少 +1 天），良好 = (间隔 + 逾期/2) × 难度系数，简单 = (间隔 + 逾期) × 系数 × 简单奖励；遗忘：系数 −0.2（下限 1.3）、进入重学步长、新间隔 = 旧间隔 × 比例。

### Leitner
重来 → 盒 1，困难 → 原盒，良好 → +1 盒，简单 → +2 盒；每盒间隔可配置（默认 1/2/4/8/16/32/64 天）。

### 每日安排
- **学习日**：按用户时区，默认凌晨 4 点切换；复习卡到期对齐到学习日开始时刻。
- **上限**：每个牌组独立的新卡 / 复习上限；学习某牌组时，它的上限同时封顶所有子牌组（与 Anki v3 一致）。自定义学习牌组不受上限约束。
- **队列顺序**：到期的学习 / 重学卡优先；复习卡按到期日（同日再按可提取性）或纯可提取性排序；新卡按手动顺序 / 创建时间 / 随机；新卡均匀穿插于复习卡（或先新卡 / 先复习）。
- **兄弟卡埋藏**：同一笔记今天只出现一张（已复习过的笔记，其兄弟卡当天不再出现）。
- **Leech**：遗忘次数达到阈值时（之后每半个阈值再次触发）自动加 `leech` 标签并暂停（可设为只打标签）。
- **负载均衡 + 轻松日**：在 fuzz 范围内选择 `(当日负载 + 1) / 星期权重` 最小的那天（相同则取最接近理想间隔），从而平滑未来每天的复习量并避开“轻松日”。

---

## 本地开发与测试

```bash
npm install
npm test            # Vitest：核心逻辑 + 真 Postgres（PGlite，进程内）上的仓储 / 隔离 / 导入导出测试
npm run lint        # ESLint + tsc --noEmit
```

运行应用需要 Postgres。可用 Neon，或使用本地 PGlite 的 Neon-HTTP 兼容垫片：

```bash
cp .env.example .env.local   # 填写 DATABASE_URL、JWT_SECRET（BLOB_READ_WRITE_TOKEN 可空）
npm run dev
# 端到端冒烟（注册两个临时账号、隔离、嵌套牌组、三种题型 + 图片、复习、撤销、导出 → 导入往返、删除账号）
BASE_URL=http://localhost:3000 node scripts/smoke.mjs
```

测试先行（TDD）：`tests/` 下每个核心模块都有对应测试 —— 调度器（含与官方 ts-fsrs 逐步比对）、负载均衡 / fuzz / Leech、队列构建、填空解析、搜索语法、树操作与排序、CSV / JSON 备份 / `.apkg` 导入往返、统计、优化器输入、认证与跨用户数据隔离、真实 FSRS 参数训练。

## 部署

- Vercel 项目 `anki-ji`（团队 olojiangs-projects，函数区域 `sin1`），Neon 数据库 `anki-ji-db`（sin1），Blob store `anki-ji-media`。
- 环境变量：`DATABASE_URL`（Neon 集成自动注入）、`JWT_SECRET`、`BLOB_READ_WRITE_TOKEN`（Blob 集成自动注入）。
- 数据表在首次请求时自动创建（`CREATE TABLE IF NOT EXISTS`，表名前缀 `ak_`）。
- GitHub Actions（`.github/workflows/ci.yml`）在 push / PR 时运行 lint + 测试。

## 已知限制 / 后续

- `.apkg`：支持旧版与新版（anki21b，zstd）包的基础 / 反向 / 填空笔记与媒体；其他自定义笔记类型按“正面 = 第一个字段、背面 = 其余字段”导入；复习进度为近似转换（间隔 → 稳定性）。不支持 `.apkg` 导出（可用 JSON / CSV）。
- 单个媒体文件上限 4 MB。
- 后续：协作共享牌组、AI 生成卡片、TTS、PWA 离线。
