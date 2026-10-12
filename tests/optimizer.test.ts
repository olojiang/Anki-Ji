import { describe, it, expect } from "vitest";
import { revlogToTrainingItems } from "@/core/optimizer";
import { dayStart } from "@/core/time";

const tz = "Asia/Shanghai";
const at = (day: number, h = 2) => new Date(dayStart(day, tz, 4).getTime() + h * 3600000);

describe("FSRS optimizer input", () => {
  it("turns each card's review history into growing prefixes with day deltas", () => {
    const revs = [
      { cardId: 1, rating: 3, state: "new" as const, reviewedAt: at(100) },
      { cardId: 1, rating: 3, state: "learning" as const, reviewedAt: at(101) },
      { cardId: 1, rating: 1, state: "review" as const, reviewedAt: at(104) },
    ];
    expect(revlogToTrainingItems(revs, tz, 4)).toEqual([
      [{ rating: 3, deltaT: 0 }, { rating: 3, deltaT: 1 }],
      [{ rating: 3, deltaT: 0 }, { rating: 3, deltaT: 1 }, { rating: 1, deltaT: 3 }],
    ]);
  });
  it("drops cards whose history does not start with a new-card review and same-day endings", () => {
    const revs = [
      { cardId: 2, rating: 3, state: "review" as const, reviewedAt: at(100) },
      { cardId: 2, rating: 3, state: "review" as const, reviewedAt: at(105) },
      { cardId: 3, rating: 1, state: "new" as const, reviewedAt: at(100, 1) },
      { cardId: 3, rating: 3, state: "learning" as const, reviewedAt: at(100, 2) },
    ];
    expect(revlogToTrainingItems(revs, tz, 4)).toEqual([]);
  });
});
