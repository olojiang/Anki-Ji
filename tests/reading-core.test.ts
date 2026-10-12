import { describe, it, expect } from "vitest";
import {
  clampPriority, readingFactor, nextReadingInterval, markReadEnough, postponeReading, markDone, reopenReading,
  buildReadingQueue, chunkBounds, readingProgress, clozeFromSelection, basicFromSelection, extractTitle, htmlToText,
  newReadingSched, extractSched, normalizeDailyCap, type ReadingSched,
} from "@/core/reading";
import { isPrivateHost, checkFetchUrl } from "@/core/safeurl";

const sched = (p: Partial<ReadingSched> = {}): ReadingSched => ({ status: "active", dueDay: 100, intervalDays: 0, reps: 0, priority: 50, ...p });

describe("reading priority + interval growth", () => {
  it("clamps priority to an integer 0–100 (default 50)", () => {
    expect(clampPriority(120)).toBe(100);
    expect(clampPriority(-3)).toBe(0);
    expect(clampPriority(33.6)).toBe(34);
    expect(clampPriority("x")).toBe(50);
    expect(clampPriority(undefined)).toBe(50);
  });
  it("high priority grows slower than low priority", () => {
    expect(readingFactor(100)).toBeCloseTo(1.5);
    expect(readingFactor(0)).toBeCloseTo(2.5);
    expect(readingFactor(50)).toBeCloseTo(2.0);
  });
  it("first 'read enough' gives 1 day, then grows, never shrinks, capped", () => {
    expect(nextReadingInterval(0, 50)).toBe(1);
    expect(nextReadingInterval(1, 50)).toBe(2);
    expect(nextReadingInterval(2, 50)).toBe(4);
    expect(nextReadingInterval(1, 100)).toBe(2); // max(prev+1, round(1.5))
    expect(nextReadingInterval(10, 100)).toBe(15);
    expect(nextReadingInterval(10, 0)).toBe(25);
    expect(nextReadingInterval(300, 0)).toBe(365);
    expect(nextReadingInterval(300, 0, 400)).toBe(400);
  });
  it("markReadEnough schedules from today and counts reps", () => {
    const a = markReadEnough(sched(), 100);
    expect(a).toMatchObject({ intervalDays: 1, dueDay: 101, reps: 1, status: "active" });
    const b = markReadEnough(a, 101);
    expect(b).toMatchObject({ intervalDays: 2, dueDay: 103, reps: 2 });
    // reading late still schedules from the actual day
    const c = markReadEnough(b, 110);
    expect(c.dueDay).toBe(110 + c.intervalDays);
    expect(c.intervalDays).toBe(4);
  });
  it("postpone pushes due by about half the interval (≥1 day) without growing reps", () => {
    expect(postponeReading(sched({ intervalDays: 0 }), 100)).toMatchObject({ dueDay: 101, reps: 0 });
    expect(postponeReading(sched({ intervalDays: 9 }), 100)).toMatchObject({ dueDay: 105, intervalDays: 9 });
    expect(postponeReading(sched({ intervalDays: 9 }), 100, 7).dueDay).toBe(107);
    expect(postponeReading(sched(), 100, 0).dueDay).toBe(101); // at least a day
  });
  it("done / reopen", () => {
    expect(markDone(sched()).status).toBe("done");
    expect(reopenReading(markDone(sched({ dueDay: 50 })), 120)).toMatchObject({ status: "active", dueDay: 120 });
  });
  it("new items are due today; extracts inherit priority and are due tomorrow", () => {
    expect(newReadingSched(100, 70)).toEqual({ status: "active", dueDay: 100, intervalDays: 0, reps: 0, priority: 70 });
    expect(extractSched(sched({ priority: 80 }), 100)).toEqual({ status: "active", dueDay: 101, intervalDays: 0, reps: 0, priority: 80 });
  });
  it("normalizes the daily cap", () => {
    expect(normalizeDailyCap(undefined)).toBe(20);
    expect(normalizeDailyCap(0)).toBe(1);
    expect(normalizeDailyCap(5000)).toBe(500);
    expect(normalizeDailyCap("12")).toBe(12);
  });
});

describe("reading queue", () => {
  const items = [
    { id: 1, priority: 50, dueDay: 100, status: "active" as const },
    { id: 2, priority: 90, dueDay: 100, status: "active" as const },
    { id: 3, priority: 90, dueDay: 95, status: "active" as const },
    { id: 4, priority: 99, dueDay: 101, status: "active" as const }, // not due yet
    { id: 5, priority: 100, dueDay: 90, status: "done" as const }, // done
    { id: 6, priority: 10, dueDay: 80, status: "active" as const },
  ];
  it("orders due items by priority desc, then most overdue, then id; applies cap", () => {
    const r = buildReadingQueue(items, 100, 10);
    expect(r.queue.map((x) => x.id)).toEqual([3, 2, 1, 6]);
    expect(r.due).toBe(4);
    expect(r.overflow).toBe(0);
    const capped = buildReadingQueue(items, 100, 2);
    expect(capped.queue.map((x) => x.id)).toEqual([3, 2]);
    expect(capped.overflow).toBe(2);
  });
  it("empty when nothing due", () => {
    expect(buildReadingQueue(items, 50, 10).queue).toEqual([]);
  });
});

describe("chunking + progress", () => {
  const paras = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(60)).join("\n\n");
  it("breaks at paragraph boundaries near the target size", () => {
    const b = chunkBounds(paras, 0, 700);
    expect(b.start).toBe(0);
    expect(b.end).toBeGreaterThanOrEqual(700);
    expect(paras.slice(b.end, b.end + 2)).toBe("\n\n");
    const b2 = chunkBounds(paras, b.end, 700);
    expect(b2.start).toBe(b.end + 2); // skips the separator
    expect(paras.slice(b2.start).startsWith("Paragraph")).toBe(true);
  });
  it("swallows a small tail into the last chunk and reports end", () => {
    const text = "a ".repeat(400) + "\n\n" + "tail";
    const b = chunkBounds(text, 0, 700);
    expect(b.end).toBe(text.length);
    expect(b.last).toBe(true);
  });
  it("does not cut inside a fenced code block", () => {
    const code = "```js\n" + "const x = 1;\n\n".repeat(80) + "```";
    const text = "Intro\n\n" + code + "\n\nAfter";
    const b = chunkBounds(text, 0, 200);
    const chunk = text.slice(b.start, b.end);
    expect((chunk.match(/```/g) ?? []).length % 2).toBe(0);
  });
  it("clamps out-of-range positions and computes progress", () => {
    expect(chunkBounds("hello", 99, 100)).toEqual({ start: 5, end: 5, last: true });
    expect(readingProgress("abcd", 2)).toBe(0.5);
    expect(readingProgress("", 0)).toBe(1);
    expect(readingProgress("abcd", 10)).toBe(1);
  });
});

describe("cards and extracts from a selection", () => {
  const src = "Spaced repetition is old. The spacing effect was described by Ebbinghaus in 1885. It is robust!";
  it("cloze wraps the selection inside its sentence", () => {
    const r = clozeFromSelection(src, "Ebbinghaus");
    expect(r.found).toBe(true);
    expect(r.text).toBe("The spacing effect was described by {{c1::Ebbinghaus}} in 1885.");
  });
  it("handles Chinese sentence punctuation", () => {
    const r = clozeFromSelection("间隔重复很古老。艾宾浩斯在1885年描述了间隔效应！效果稳健。", "艾宾浩斯");
    expect(r.text).toBe("{{c1::艾宾浩斯}}在1885年描述了间隔效应！");
  });
  it("falls back to a bare cloze when the selection is not found verbatim", () => {
    expect(clozeFromSelection(src, "nonexistent words")).toEqual({ text: "{{c1::nonexistent words}}", found: false });
  });
  it("escapes '}}' that would break the cloze and trims whitespace", () => {
    expect(clozeFromSelection("x", "  a}}b  ").text).toBe("{{c1::a} }b}}");
  });
  it("basic card: selection on the front, source on the back hint", () => {
    expect(basicFromSelection("  What is FSRS?  ")).toEqual({ front: "What is FSRS?", back: "" });
  });
  it("extract titles are short single-line", () => {
    expect(extractTitle("Line one\nline two")).toBe("Line one line two");
    expect(extractTitle("x".repeat(100)).length).toBe(61); // 60 + ellipsis
    expect(extractTitle("**bold** _it_ `code`")).toBe("bold it code");
  });
});

describe("htmlToText", () => {
  it("extracts title and readable markdown-ish text, dropping scripts/nav", () => {
    const html = `<html><head><title>My &amp; Article</title><style>.a{}</style><script>alert(1)</script></head>
      <body><nav>Menu Home</nav><article><h1>Heading</h1><p>First <b>para</b> &lt;ok&gt;.</p><ul><li>One</li><li>Two</li></ul>
      <p>Second<br>line</p><pre><code>let x = 1;</code></pre></article><footer>Copyright</footer></body></html>`;
    const r = htmlToText(html);
    expect(r.title).toBe("My & Article");
    expect(r.text).toContain("# Heading");
    expect(r.text).toContain("First para <ok>.");
    expect(r.text).toContain("- One\n- Two");
    expect(r.text).toContain("Second\nline");
    expect(r.text).toContain("let x = 1;");
    expect(r.text).not.toContain("alert");
    expect(r.text).not.toContain("Menu Home");
    expect(r.text).not.toContain("Copyright");
    expect(r.text).not.toMatch(/\n{3,}/);
  });
  it("prefers <article>/<main> when present and decodes numeric entities", () => {
    const r = htmlToText("<body><div>junk sidebar</div><main><p>&#20013;&#x6587; text</p></main></body>");
    expect(r.text).toBe("中文 text");
  });
});

describe("safe URL check for server-side fetch", () => {
  it("rejects private / local hosts", () => {
    for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "[::1]", "fd00::1", "fe80::1", "foo.local", "metadata.google.internal", "::ffff:127.0.0.1"]) {
      expect(isPrivateHost(h), h).toBe(true);
    }
    for (const h of ["example.com", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateHost(h), h).toBe(false);
  });
  it("only allows http(s) without credentials", () => {
    expect(checkFetchUrl("https://example.com/a")).toBeTruthy();
    expect(() => checkFetchUrl("ftp://example.com")).toThrow("invalid_url");
    expect(() => checkFetchUrl("file:///etc/passwd")).toThrow("invalid_url");
    expect(() => checkFetchUrl("http://user:pw@example.com")).toThrow("invalid_url");
    expect(() => checkFetchUrl("http://127.0.0.1:3000")).toThrow("blocked_url");
    expect(() => checkFetchUrl("not a url")).toThrow("invalid_url");
  });
});
