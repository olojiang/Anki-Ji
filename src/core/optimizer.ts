import type { CardState } from "./types";
import { dayIndex } from "./time";

export interface TrainingReview { rating: number; deltaT: number }

/**
 * Build FSRS training items from the review log (same rules as Anki/fsrs-rs):
 * per card, every prefix that ends on a later day than the previous review.
 */
export function revlogToTrainingItems(revs: { cardId: number; rating: number; state: CardState; reviewedAt: Date }[], tz: string, rollover: number): TrainingReview[][] {
  const byCard = new Map<number, typeof revs>();
  for (const r of revs) (byCard.get(r.cardId) ?? byCard.set(r.cardId, []).get(r.cardId)!).push(r);
  const items: TrainingReview[][] = [];
  for (const list of byCard.values()) {
    list.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
    if (list[0].state !== "new") continue;
    const seq: TrainingReview[] = [];
    let prevDay: number | null = null;
    for (const r of list) {
      if (r.rating < 1 || r.rating > 4) continue;
      const d = dayIndex(r.reviewedAt, tz, rollover);
      seq.push({ rating: r.rating, deltaT: prevDay == null ? 0 : d - prevDay });
      prevDay = d;
      if (seq.length >= 2 && seq[seq.length - 1].deltaT > 0) items.push(seq.map((x) => ({ ...x })));
    }
  }
  return items;
}
