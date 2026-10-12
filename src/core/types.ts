/** Shared domain types. Pure data – no framework or DB imports allowed in src/core. */
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const RATINGS: Rating[] = [1, 2, 3, 4];
export type CardState = "new" | "learning" | "review" | "relearning";
export type Algorithm = "fsrs" | "sm2" | "leitner";

/** Scheduling state of one card. Algorithm specific fields live side by side so a deck can switch algorithms. */
export interface SchedState {
  state: CardState;
  due: Date;
  stability: number; // FSRS S (days)
  difficulty: number; // FSRS D (1–10)
  elapsedDays: number;
  scheduledDays: number; // current interval in days
  reps: number;
  lapses: number;
  step: number; // index into (re)learning steps
  lastReview: Date | null;
  ease: number; // SM-2 ease factor (e.g. 2.5)
  box: number; // Leitner box (0 = new)
}

export interface DeckConfig {
  algorithm: Algorithm;
  newPerDay: number;
  reviewsPerDay: number;
  learningSteps: number[]; // minutes
  relearningSteps: number[]; // minutes
  graduatingInterval: number; // days (SM-2)
  easyInterval: number; // days (SM-2)
  startingEase: number;
  easyBonus: number;
  hardInterval: number;
  intervalModifier: number;
  lapseNewInterval: number; // multiplier of old interval after a lapse (SM-2)
  desiredRetention: number; // FSRS
  maxInterval: number; // days
  fsrsWeights: number[] | null;
  enableShortTerm: boolean;
  leitnerIntervals: number[]; // days per box
  fuzz: boolean;
  loadBalance: boolean;
  easyDays: number[]; // weight per weekday, index 0 = Sunday. 1 normal, 0.5 reduced, 0 minimum
  buryNew: boolean;
  buryReview: boolean;
  leechThreshold: number;
  leechAction: "suspend" | "tag";
  newOrder: "manual" | "created" | "random";
  reviewOrder: "due" | "retrievability" | "random";
  newReviewMix: "mix" | "newFirst" | "reviewFirst";
  learnAheadMinutes: number;
}

export type NoteType = "basic" | "basic_reverse" | "basic_optional_reverse" | "cloze" | "type_in" | "mcq" | "image_occlusion" | "custom";
/** Built-in (stock) types. "custom" notes use a user note type (core/notetypes.ts) and are not listed here. */
export const NOTE_TYPES: NoteType[] = ["basic", "basic_reverse", "basic_optional_reverse", "cloze", "type_in", "mcq", "image_occlusion"];

export interface OcclusionMask { x: number; y: number; w: number; h: number; label?: string } // percentages 0–100

export interface NoteFields {
  front?: string;
  back?: string;
  addReverse?: boolean;
  text?: string;
  extra?: string;
  question?: string;
  options?: string[];
  correct?: number[];
  explanation?: string;
  image?: string;
  masks?: OcclusionMask[];
  header?: string;
  occlusionMode?: "hideOne" | "hideAll";
  custom?: Record<string, string>; // custom note types: field id → value
}
