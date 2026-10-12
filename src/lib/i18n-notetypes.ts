/** Strings for note types / card templates: [中文, English]. Kept separate from the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const NT_DICT = {
  navNoteTypes: ["笔记类型", "Note types"],
  title: ["笔记类型", "Note types"],
  subtitle: ["自定义字段、卡片模板与样式，一条笔记可生成多张卡片", "Custom fields, card templates and styling — one note can make many cards"],
  manage: ["管理笔记类型", "Manage note types"],
  builtIn: ["内置类型", "Built-in"], custom: ["自定义类型", "Custom"], stockBadge: ["内置", "Built-in"], readOnly: ["只读", "Read-only"],
  kindStandard: ["标准", "Standard"], kindCloze: ["填空", "Cloze"],
  notesN: ["{n} 条笔记", "{n} notes"], fieldsN: ["{n} 个字段", "{n} fields"], cardsN: ["{n} 种卡片", "{n} card types"],
  newType: ["新建类型", "New type"], clone: ["复制", "Clone"], cloneToEdit: ["复制后编辑", "Clone to customise"],
  name: ["名称", "Name"], basedOn: ["基于", "Based on"], blankStandard: ["空白（标准）", "Blank (standard)"], blankCloze: ["空白（填空）", "Blank (cloze)"],
  rename: ["重命名", "Rename"], delete: ["删除", "Delete"], save: ["保存更改", "Save changes"], discard: ["放弃更改", "Discard"],
  unsaved: ["有未保存的更改", "Unsaved changes"], saved: ["已保存", "Saved"],
  savedCards: ["已保存 · 新增 {a} 张卡片，移除 {r} 张", "Saved · {a} cards added, {r} removed"],
  deleteQ: ["删除笔记类型“{name}”？", "Delete note type “{name}”?"],
  deleteInUse: ["还有 {n} 条笔记使用此类型，请先删除或移动这些笔记", "{n} notes still use this type — delete them first"],
  stockHelp: ["内置类型由应用维护，不能直接修改；复制一份即可自由编辑字段、模板与样式。", "Built-in types are maintained by the app. Clone one to edit its fields, templates and styling freely."],
  selectType: ["选择左侧的笔记类型进行查看或编辑", "Select a note type to view or edit it"],
  back: ["返回列表", "Back to list"],
  tabFields: ["字段", "Fields"], tabCards: ["卡片模板", "Cards"], tabStyle: ["样式", "Styling"],
  addField: ["添加字段", "Add field"], newFieldPh: ["新字段名称", "New field name"], sortBy: ["排序字段", "Sort field"],
  rtl: ["从右到左", "Right-to-left"], moveUp: ["上移", "Move up"], moveDown: ["下移", "Move down"],
  fieldRenameNote: ["重命名字段会同步更新模板中的引用；删除字段会清除所有笔记中该字段的内容。", "Renaming a field updates template references; deleting a field erases its content from every note."],
  removeFieldQ: ["删除字段“{name}”？{n} 条笔记中的此字段内容将被清除。", "Delete field “{name}”? Its content in {n} notes will be erased."],
  addTemplate: ["添加卡片类型", "Add card type"], templateName: ["卡片名称", "Card name"],
  frontTpl: ["正面模板", "Front template"], backTpl: ["背面模板", "Back template"], css: ["样式（CSS）", "Styling (CSS)"],
  insertField: ["插入字段", "Insert field"],
  removeTemplateQ: ["删除卡片类型“{name}”？已有的此类卡片（含复习记录）将被删除。", "Delete card type “{name}”? Its existing cards (and their review history) will be deleted."],
  saveRemovesQ: ["保存后将删除 {n} 种卡片类型及其已有卡片（含复习记录），确定继续？", "Saving deletes {n} card type(s) and their existing cards (with review history). Continue?"],
  preview: ["预览", "Preview"], front: ["正面", "Front"], backSide: ["背面", "Back"], sampleValues: ["预览用的字段内容", "Preview field values"],
  tplHelp: ["语法：{{字段}} · {{FrontSide}} · {{#字段}}…{{/字段}} 有内容时显示 · {{^字段}}…{{/字段}} 为空时显示 · {{type:字段}} 输入作答 · {{cloze:字段}} 填空 · {{hint:字段}} 提示 · {{text:字段}} 纯文本 · {{tts zh_CN:字段}} 朗读",
    "Syntax: {{Field}} · {{FrontSide}} · {{#Field}}…{{/Field}} if not empty · {{^Field}}…{{/Field}} if empty · {{type:Field}} type answer · {{cloze:Field}} · {{hint:Field}} · {{text:Field}} plain text · {{tts en_US:Field}} speech"],
  cssHelp: ["样式只作用于卡片内部；.card 表示卡片本身，.nightMode .card 用于深色主题", "Styles apply inside the card only; .card is the card itself, .nightMode .card targets dark themes"],
  markdownFields: ["字段内容按 Markdown 渲染", "Render field content as Markdown"],
  markdownHint: ["关闭后字段按原始 HTML 显示（Anki 导入的类型默认关闭）", "Off: fields are shown as raw HTML (default for types imported from Anki)"],
  issues: ["需要修正", "Needs fixing"],
  hint: ["提示", "Hint"],
  cardLabel: ["卡片 {n}", "Card {n}"],
  // validation codes
  v_empty_name: ["名称不能为空", "Name can't be empty"],
  v_duplicate_name: ["名称重复：{d}", "Duplicate name: {d}"],
  v_bad_name: ["字段名不能包含 : { } \" 或以 # ^ / 开头：{d}", "Field names can't contain : { } \" or start with # ^ /: {d}"],
  v_reserved_name: ["“{d}”是保留名称", "“{d}” is a reserved name"],
  v_no_fields: ["至少需要一个字段", "Add at least one field"],
  v_no_templates: ["至少需要一种卡片", "Add at least one card type"],
  v_cloze_one_template: ["填空类型只能有一种卡片", "Cloze types have exactly one card type"],
  v_unknown_field: ["未知字段：{d}", "Unknown field: {d}"],
  v_no_field: ["正面模板至少要引用一个字段", "The front template must use at least one field"],
  v_no_cloze: ["填空类型的正面需要 {{cloze:字段}}", "Cloze front needs {{cloze:Field}}"],
  v_unclosed_section: ["条件块未闭合：{{#{d}}}", "Unclosed section: {{#{d}}}"],
  v_unexpected_close: ["多余的结束标签：{{/{d}}}", "Unexpected closing tag: {{/{d}}}"],
  // server error codes
  e_no_cards: ["按当前内容不会生成任何卡片，请填写正面所需的字段", "These fields would produce no cards — fill in the fields the front uses"],
  e_notetype_required: ["请选择笔记类型", "Choose a note type"],
  e_notetype_not_found: ["笔记类型不存在", "Note type not found"],
  e_notetype_in_use: ["还有笔记在使用此类型", "Notes still use this type"],
  e_notetype_not_clonable: ["此内置类型不能复制", "This built-in type can't be cloned"],
  e_notetype_kind_change_unsupported: ["不能更改类型种类（标准/填空）", "Can't switch between standard and cloze"],
} as const;

export type NtKey = keyof typeof NT_DICT;

export function tn(locale: Locale, key: NtKey | string, vars?: Record<string, string | number>): string {
  const e = (NT_DICT as Record<string, readonly [string, string]>)[key];
  let s = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Translated message for a note-type error code (server "code" or "code:detail"), or null. */
export function noteTypeErrorMessage(locale: Locale, e: unknown): string | null {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : (e as { code?: string })?.code ?? "";
  const [code, ...rest] = raw.split(":");
  const detail = rest.join(":");
  if (`e_${code}` in NT_DICT) return tn(locale, `e_${code}`);
  if (`v_${code}` in NT_DICT) return tn(locale, `v_${code}`, { d: detail });
  return null;
}
