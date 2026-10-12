/** Import format constants (kept separate from the parsers so UI code can use them without bundling every parser). */
export type ImportFormat = "backup" | "apkg" | "csv" | "xlsx" | "markdown" | "obsidian" | "mochi" | "remnote" | "quizlet" | "supermemo" | "supermemo-xml" | "mnemosyne" | "smart";
export const PASTE_FORMATS = ["smart", "quizlet", "supermemo", "markdown", "remnote", "csv"] as const;
export type PasteFormat = (typeof PASTE_FORMATS)[number];
export const FILE_ACCEPT = ".json,.csv,.tsv,.txt,.apkg,.colpkg,.xlsx,.xls,.ods,.md,.markdown,.zip,.mochi,.xml,.cards";
export const FILE_HINT = ".json · .apkg · .csv/.tsv/.txt · .xlsx/.xls · .md · .zip (Obsidian) · .mochi · .xml/.cards (SuperMemo/Mnemosyne)";
/** Formats whose deck structure comes from the file itself (the "default deck" field does not apply). */
export const SELF_DECKED: ImportFormat[] = ["backup", "apkg", "mochi"];
