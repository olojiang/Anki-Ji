import { NextResponse } from "next/server";
import { open, body, HttpError } from "@/server/http";
import { createUser, findByEmail } from "@/server/repo/users";
import { hashPassword, signSession, SESSION_COOKIE } from "@/server/auth";
import { createDeck } from "@/server/repo/decks";
import { createNote } from "@/server/repo/notes";

export const POST = open(async (req) => {
  const b = await body<{ email?: string; password?: string; name?: string; locale?: string; timezone?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "invalid_email");
  if ((b.password ?? "").length < 8) throw new HttpError(400, "password_too_short");
  if (await findByEmail(email)) throw new HttpError(409, "email_taken");
  const user = await createUser(email, await hashPassword(b.password!), b.name || email.split("@")[0], { locale: b.locale === "en" ? "en" : "zh", timezone: b.timezone });
  // starter deck so the first screen is not empty
  const zh = user.settings.locale === "zh";
  const deck = await createDeck(user.id, { name: zh ? "入门示例" : "Getting started" });
  await createNote(user.id, { deckId: deck.id, type: "basic", fields: zh ? { front: "**Anki-ji** 用什么算法安排复习？", back: "默认 **FSRS-6**（可在牌组选项里切换 SM-2 或 Leitner）" } : { front: "Which algorithm does **Anki-ji** use?", back: "**FSRS-6** by default (SM-2 and Leitner are available in deck options)" }, tags: ["intro"] });
  await createNote(user.id, { deckId: deck.id, type: "cloze", fields: zh ? { text: "间隔重复的核心是在快要{{c1::遗忘}}之前{{c2::复习}}。", extra: "" } : { text: "Spaced repetition reviews just before you {{c1::forget}}.", extra: "" }, tags: ["intro"] });
  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, settings: user.settings } });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
});
