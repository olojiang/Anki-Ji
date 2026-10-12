import { describe, it, expect, beforeAll, vi } from "vitest";

let sessionToken: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (sessionToken ? { value: sessionToken } : undefined) }) }));

import { NextRequest } from "next/server";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import { signSession } from "@/server/auth";
import { getTtsSettings, setTtsScope } from "@/server/services/tts";
import * as route from "@/app/api/tts/settings/route";

describe("TTS preferences", () => {
  let a: number, b: number, deckA: number, childA: number, deckB: number;
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("tts-a@test.dev", "h", "A")).id;
    b = (await users.createUser("tts-b@test.dev", "h", "B")).id;
    deckA = (await decks.createDeck(a, { name: "English" })).id;
    childA = (await decks.createDeck(a, { name: "Verbs", parentId: deckA })).id;
    deckB = (await decks.createDeck(b, { name: "Other" })).id;
  });

  it("stores normalized options per scope and returns deck parents", async () => {
    await setTtsScope(a, "default", { rate: 1.2 });
    await setTtsScope(a, `deck:${deckA}`, { autoFront: true, frontLang: "en_US", rate: 5 });
    await setTtsScope(a, "type:cloze", { autoBack: true });
    const s = await getTtsSettings(a);
    expect(s.scopes.default).toMatchObject({ rate: 1.2, autoFront: false });
    expect(s.scopes[`deck:${deckA}`]).toMatchObject({ autoFront: true, frontLang: "en-US", rate: 2 });
    expect(s.scopes["type:cloze"]).toMatchObject({ autoBack: true });
    expect(s.deckParents[childA]).toBe(deckA);
    expect(s.deckParents[deckA]).toBeNull();
    await setTtsScope(a, "type:cloze", null);
    expect((await getTtsSettings(a)).scopes["type:cloze"]).toBeUndefined();
  });

  it("isolates users and refuses other users' decks / bad scopes", async () => {
    expect((await getTtsSettings(b)).scopes).toEqual({});
    expect(Object.keys((await getTtsSettings(b)).deckParents)).toEqual([String(deckB)]);
    await expect(setTtsScope(b, `deck:${deckA}`, { autoFront: true })).rejects.toThrow("deck_not_found");
    await expect(setTtsScope(b, "user:1", {})).rejects.toThrow("invalid_scope");
  });

  it("route requires a session and acts on the caller only", async () => {
    const ctx = { params: Promise.resolve({}) };
    sessionToken = undefined;
    expect((await route.GET(new NextRequest("http://localhost/api/tts/settings"), ctx)).status).toBe(401);
    sessionToken = await signSession(b);
    const put = await route.PUT(new NextRequest("http://localhost/api/tts/settings", { method: "PUT", body: JSON.stringify({ scope: `deck:${deckB}`, opts: { autoBack: true } }), headers: { "content-type": "application/json" } }), ctx);
    expect(put.status).toBe(200);
    const got = await (await route.GET(new NextRequest("http://localhost/api/tts/settings"), ctx)).json();
    expect(got.scopes[`deck:${deckB}`]).toMatchObject({ autoBack: true });
    expect(got.scopes.default).toBeUndefined();
  });
});
