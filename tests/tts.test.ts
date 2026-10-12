import { describe, it, expect } from "vitest";
import { defaultTtsOptions, normalizeTtsOptions, resolveTtsOptions, deckChain, speakableText, parseTtsSegments, stripTtsMarkers, detectLang, extractAudioUrls, ttsScopeValid } from "@/core/tts";

describe("TTS options", () => {
  it("normalizes input, clamping rate and dropping junk", () => {
    expect(normalizeTtsOptions({ rate: 9, autoFront: "yes", frontLang: "en-US", backVoice: 42 } as never)).toEqual({ ...defaultTtsOptions(), rate: 2, frontLang: "en-US" });
    expect(normalizeTtsOptions(null)).toEqual(defaultTtsOptions());
    expect(normalizeTtsOptions({ frontLang: "<script>" })).toMatchObject({ frontLang: "auto" });
  });
  it("resolves deck > parent deck > note type > default", () => {
    const scopes = {
      default: { ...defaultTtsOptions(), rate: 1.1 },
      "type:cloze": { ...defaultTtsOptions(), autoFront: true, rate: 0.8 },
      "deck:1": { ...defaultTtsOptions(), autoBack: true, backLang: "zh-CN" },
    };
    const parents = { 3: 1, 1: null, 2: null } as Record<number, number | null>;
    expect(deckChain(3, parents)).toEqual([3, 1]);
    expect(resolveTtsOptions(scopes, { decks: deckChain(3, parents), noteType: "cloze" })).toMatchObject({ autoBack: true, backLang: "zh-CN", autoFront: false });
    expect(resolveTtsOptions(scopes, { decks: [2], noteType: "cloze" })).toMatchObject({ autoFront: true, rate: 0.8 });
    expect(resolveTtsOptions(scopes, { decks: [2], noteType: "basic" })).toMatchObject({ rate: 1.1 });
    expect(resolveTtsOptions({}, { decks: [], noteType: "basic" })).toEqual(defaultTtsOptions());
  });
  it("guards against cyclic deck parents", () => {
    expect(deckChain(1, { 1: 2, 2: 1 })).toEqual([1, 2]);
  });
  it("validates scopes", () => {
    expect(ttsScopeValid("default")).toBe(true);
    expect(ttsScopeValid("deck:12")).toBe(true);
    expect(ttsScopeValid("type:basic_reverse")).toBe(true);
    expect(ttsScopeValid("deck:x")).toBe(false);
    expect(ttsScopeValid("user:1")).toBe(false);
  });
});

describe("speakable text", () => {
  it("strips markdown, html, media, math and cloze markup", () => {
    expect(speakableText("**Bold** and `code` ![audio](https://x/a.mp3) ![](https://x/i.png) [link](https://x)")).toBe("Bold and code link");
    expect(speakableText('The <span class="cloze">[...]</span> makes ATP')).toBe("The … makes ATP");
    expect(speakableText('The <span class="cloze">[organ]</span> makes ATP')).toBe("The … (organ) makes ATP");
    expect(speakableText("$$E=mc^2$$ formula")).toBe("formula");
    expect(speakableText("Line1\n\n- item")).toBe("Line1. item");
  });
  it("parses {{tts lang:text}} and [anki:tts] markers into language segments", () => {
    const s = parseTtsSegments("Word: {{tts en_US:apple}} means 苹果", "zh-CN");
    expect(s).toEqual([{ text: "Word:", lang: "zh-CN" }, { text: "apple", lang: "en-US" }, { text: "means 苹果", lang: "zh-CN" }]);
    expect(parseTtsSegments("[anki:tts lang=ja_JP]猫[/anki:tts]", "auto")).toEqual([{ text: "猫", lang: "ja-JP" }]);
    expect(parseTtsSegments("Hello", "auto")).toEqual([{ text: "Hello", lang: "en-US" }]);
  });
  it("stripTtsMarkers keeps the visible text", () => {
    expect(stripTtsMarkers("A {{tts en_US:apple}} B [anki:tts lang=fr_FR]pomme[/anki:tts]")).toBe("A apple B pomme");
    expect(stripTtsMarkers("{{c1::x}} untouched")).toBe("{{c1::x}} untouched");
  });
  it("detects a language from the script", () => {
    expect(detectLang("你好世界")).toBe("zh-CN");
    expect(detectLang("こんにちは")).toBe("ja-JP");
    expect(detectLang("안녕하세요")).toBe("ko-KR");
    expect(detectLang("Привет")).toBe("ru-RU");
    expect(detectLang("hello")).toBe("en-US");
  });
  it("extracts the card's own audio URLs", () => {
    expect(extractAudioUrls("x ![audio](https://b/rec.webm) ![](https://b/s.mp3?x=1) ![](https://b/i.png) <audio src=\"https://b/c.ogg\"></audio>")).toEqual(["https://b/rec.webm", "https://b/s.mp3?x=1", "https://b/c.ogg"]);
  });
});
