import { authed, body } from "@/server/http";
import { userContext } from "@/server/services/context";
import { createReadingItem, getReadingQueue, listReadingItems } from "@/server/services/reading";
import { fetchArticle } from "@/server/services/article";

export const maxDuration = 30;

export const GET = authed(async (_req, { uid }) => {
  const { today } = await userContext(uid);
  const [items, queue] = await Promise.all([listReadingItems(uid), getReadingQueue(uid, today)]);
  return { items, queue: queue.queue.map((i) => i.id), due: queue.due, overflow: queue.overflow, cap: queue.cap, today };
});

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ title?: string; content?: string; priority?: number; url?: string }>(req);
  const { today } = await userContext(uid);
  if (b.url && !b.content?.trim()) {
    const art = await fetchArticle(b.url);
    return { item: await createReadingItem(uid, { title: b.title?.trim() || art.title, content: art.content, priority: b.priority, sourceUrl: art.sourceUrl }, today) };
  }
  return { item: await createReadingItem(uid, { title: b.title, content: b.content ?? "", priority: b.priority, sourceUrl: b.url }, today) };
});
