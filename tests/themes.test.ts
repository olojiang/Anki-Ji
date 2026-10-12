import { describe, expect, it } from "vitest";
import { normalizeSettings, THEME_IDS } from "@/core/settings";
import { THEMES, resolveTheme, themeBootScript, isTheme } from "@/lib/themes";
import { readFileSync } from "node:fs";

describe("themes", () => {
  it("settings accept every theme id and fall back to light", () => {
    for (const id of THEME_IDS) expect(normalizeSettings({ theme: id }).theme).toBe(id);
    expect(normalizeSettings({ theme: "purple" as never }).theme).toBe("light");
  });
  it("registry covers all concrete themes and each has a CSS token block", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(THEMES.map((t) => t.id).sort()).toEqual(THEME_IDS.filter((t) => t !== "system").sort());
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t.id}"]`);
  });
  it("resolves system and validates ids", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("gold", false)).toBe("gold");
    expect(isTheme("ink")).toBe(true);
    expect(isTheme("violet")).toBe(false);
    expect(themeBootScript).toContain("data-theme");
  });
});
