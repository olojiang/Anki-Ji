import { describe, it, expect } from "vitest";
import { parseSearch, matches, type SearchItem } from "@/core/search";

const today = 20000;
const item = (o: Partial<SearchItem>): SearchItem => ({
  text: "Hello world", deckPath: "Lang::English", tags: ["vocab::verbs"], noteType: "basic", state: "new",
  dueDay: null, suspended: false, buried: false, flag: 0, leech: false, createdDay: today, interval: 0, lapses: 0, reps: 0, ord: 0, ...o,
});
const m = (q: string, o: Partial<SearchItem> = {}) => matches(parseSearch(q), item(o), { today });

describe("search parser", () => {
  it("parses AND / OR / NOT / groups / quotes", () => {
    expect(parseSearch("a b")).toEqual({ type: "and", items: [{ type: "text", value: "a" }, { type: "text", value: "b" }] });
    expect(parseSearch("a OR b").type).toBe("or");
    expect(parseSearch("-a")).toEqual({ type: "not", item: { type: "text", value: "a" } });
    expect(parseSearch('"hello world"')).toEqual({ type: "text", value: "hello world" });
    expect(parseSearch("(a OR b) c").type).toBe("and");
    expect(parseSearch("")).toEqual({ type: "all" });
    expect(parseSearch('deck:"My Deck"')).toEqual({ type: "field", key: "deck", value: "My Deck" });
  });
  it("text matching is case-insensitive with wildcards", () => {
    expect(m("hello")).toBe(true);
    expect(m("HELLO WOR")).toBe(true); // implicit AND of two terms
    expect(m('"world hello"')).toBe(false);
    expect(m("h*d")).toBe(true);
    expect(m("-hello")).toBe(false);
    expect(m("nope OR world")).toBe(true);
  });
  it("deck: matches the deck and its children", () => {
    expect(m("deck:Lang")).toBe(true);
    expect(m("deck:lang::english")).toBe(true);
    expect(m("deck:Lan")).toBe(false);
    expect(m("deck:Lan*")).toBe(true);
    expect(m("deck:Math")).toBe(false);
  });
  it("tag: matches hierarchical tags", () => {
    expect(m("tag:vocab")).toBe(true);
    expect(m("tag:vocab::verbs")).toBe(true);
    expect(m("tag:verbs")).toBe(false);
    expect(m("tag:none", { tags: [] })).toBe(true);
    expect(m("tag:none")).toBe(false);
  });
  it("is: states", () => {
    expect(m("is:new")).toBe(true);
    expect(m("is:due")).toBe(false);
    expect(m("is:due", { state: "review", dueDay: today })).toBe(true);
    expect(m("is:due", { state: "review", dueDay: today + 1 })).toBe(false);
    expect(m("is:due", { state: "learning", dueDay: today })).toBe(true);
    expect(m("is:review", { state: "relearning" })).toBe(true);
    expect(m("is:learn", { state: "relearning" })).toBe(true);
    expect(m("is:suspended", { suspended: true })).toBe(true);
    expect(m("is:buried", { buried: true })).toBe(true);
    expect(m("is:leech", { leech: true })).toBe(true);
    expect(m("is:flagged", { flag: 2 })).toBe(true);
    expect(m("flag:2", { flag: 2 })).toBe(true);
    expect(m("flag:1", { flag: 2 })).toBe(false);
  });
  it("type:, added:, prop:, card:", () => {
    expect(m("type:cloze", { noteType: "cloze" })).toBe(true);
    expect(m("type:basic")).toBe(true);
    expect(m("added:1")).toBe(true);
    expect(m("added:3", { createdDay: today - 5 })).toBe(false);
    expect(m("prop:ivl>10", { interval: 11 })).toBe(true);
    expect(m("prop:ivl>=11", { interval: 11 })).toBe(true);
    expect(m("prop:lapses<2", { lapses: 3 })).toBe(false);
    expect(m("prop:due=1", { state: "review", dueDay: today + 1 })).toBe(true);
    expect(m("prop:reps!=0")).toBe(false);
    expect(m("card:2", { ord: 1 })).toBe(true);
  });
  it("complex combinations", () => {
    expect(m("deck:Lang (tag:vocab OR is:suspended) -is:leech")).toBe(true);
    expect(m("deck:Lang -(tag:vocab OR is:suspended)")).toBe(false);
  });
  it("never throws on garbage", () => {
    expect(() => parseSearch("(((a OR")).not.toThrow();
    expect(() => parseSearch('")(:-')).not.toThrow();
    expect(m("prop:ivl>abc")).toBe(false);
  });
});
