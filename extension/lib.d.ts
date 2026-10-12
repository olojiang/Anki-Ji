export declare const MODELS: string[];
export declare const CAPTURE_TTL_MS: number;
export declare function normalizeServerUrl(input: string): string;
export declare function endpointFor(base: string): string;
export declare function parseTags(s: string): string[];
export declare function escapeHtml(s: string): string;
export declare function textToHtml(s: string): string;
export declare function sourceHtml(url: string, title?: string): string;
export declare function prefillFromSelection(text: string): { front: string; back: string };
export declare function clozeWrap(text: string, start: number, end: number): string;
export interface NoteInput { front: string; back: string; deck: string; tags: string; model: string; sourceUrl?: string; sourceTitle?: string; includeSource?: boolean }
export declare function buildNote(input: NoteInput): { deckName: string; modelName: string; fields: Record<string, string>; tags: string[]; options: { allowDuplicate: boolean; duplicateScope: string } };
export declare function ankiRequest(fetchImpl: typeof fetch, base: string, token: string, action: string, params?: Record<string, unknown>): Promise<unknown>;
export declare function isFreshCapture(capture: { text?: string; at?: number } | null, now: number): boolean;
