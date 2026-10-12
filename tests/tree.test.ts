import { describe, it, expect } from "vitest";
import { buildTree, descendantIds, deckPath, canMove, positionBetween, planMove, flattenTree, planEnsurePath, ancestorIds } from "@/core/tree";

const decks = [
  { id: 1, parentId: null, name: "Lang", position: 1 },
  { id: 2, parentId: 1, name: "English", position: 2 },
  { id: 3, parentId: 1, name: "Japanese", position: 1 },
  { id: 4, parentId: 3, name: "Kanji", position: 1 },
  { id: 5, parentId: null, name: "Math", position: 2 },
];

describe("tree ops", () => {
  it("builds a sorted tree with unlimited nesting", () => {
    const t = buildTree(decks);
    expect(t.map((n) => n.name)).toEqual(["Lang", "Math"]);
    expect(t[0].children.map((n) => n.name)).toEqual(["Japanese", "English"]);
    expect(t[0].children[0].children[0].name).toBe("Kanji");
  });
  it("flattens in display order with depth", () => {
    expect(flattenTree(buildTree(decks)).map((n) => `${n.depth}:${n.name}`)).toEqual(["0:Lang", "1:Japanese", "2:Kanji", "1:English", "0:Math"]);
  });
  it("descendants, ancestors and paths", () => {
    expect(descendantIds(decks, 1).sort()).toEqual([1, 2, 3, 4]);
    expect(ancestorIds(decks, 4)).toEqual([3, 1]);
    expect(deckPath(decks, 4)).toBe("Lang::Japanese::Kanji");
  });
  it("forbids cycles", () => {
    expect(canMove(decks, 1, 4)).toBe(false);
    expect(canMove(decks, 1, 1)).toBe(false);
    expect(canMove(decks, 4, 5)).toBe(true);
    expect(canMove(decks, 4, null)).toBe(true);
  });
  it("positionBetween", () => {
    expect(positionBetween(null, null)).toBe(1);
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(null, 1)).toBe(0);
    expect(positionBetween(3, null)).toBe(4);
  });
  it("plans a move to an index among new siblings", () => {
    expect(planMove(decks, 4, null, 1)).toEqual({ parentId: null, position: 1.5, renumber: [] });
    expect(planMove(decks, 5, 1, 0)).toEqual({ parentId: 1, position: 0, renumber: [] });
    expect(planMove(decks, 2, 1, 0)).toEqual({ parentId: 1, position: 0, renumber: [] }); // reorder within parent
    expect(() => planMove(decks, 1, 3, 0)).toThrow();
  });
  it("renumbers when positions collapse", () => {
    const tight = [{ id: 1, parentId: null, name: "a", position: 1 }, { id: 2, parentId: null, name: "b", position: 1 + 1e-12 }, { id: 3, parentId: null, name: "c", position: 5 }];
    const m = planMove(tight, 3, null, 1);
    expect(m.renumber.length).toBeGreaterThan(0);
  });
  it("plans creation of missing path segments (Anki :: syntax)", () => {
    expect(planEnsurePath(decks, "Lang::Japanese::Grammar::N5")).toEqual({ existingId: 3, create: ["Grammar", "N5"] });
    expect(planEnsurePath(decks, "Lang::English")).toEqual({ existingId: 2, create: [] });
    expect(planEnsurePath(decks, "New")).toEqual({ existingId: null, create: ["New"] });
  });
});
