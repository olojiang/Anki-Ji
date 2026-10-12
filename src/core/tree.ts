/** Generic ordered tree helpers used for decks (unlimited nesting) and tag hierarchies. */
export interface TreeItem { id: number; parentId: number | null; name: string; position: number }
export type TreeNode<T extends TreeItem> = T & { children: TreeNode<T>[] };
export type FlatNode<T extends TreeItem> = TreeNode<T> & { depth: number };

const bySiblingOrder = (a: TreeItem, b: TreeItem) => a.position - b.position || a.name.localeCompare(b.name) || a.id - b.id;

export function buildTree<T extends TreeItem>(items: T[]): TreeNode<T>[] {
  const nodes = new Map<number, TreeNode<T>>();
  for (const it of items) nodes.set(it.id, { ...it, children: [] });
  const roots: TreeNode<T>[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId != null ? nodes.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const sort = (list: TreeNode<T>[]) => { list.sort(bySiblingOrder); list.forEach((c) => sort(c.children)); };
  sort(roots);
  return roots;
}

export function flattenTree<T extends TreeItem>(roots: TreeNode<T>[], depth = 0, out: FlatNode<T>[] = []): FlatNode<T>[] {
  for (const n of roots) { out.push({ ...n, depth }); flattenTree(n.children, depth + 1, out); }
  return out;
}

export function descendantIds(items: TreeItem[], id: number): number[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const it of items) if (it.parentId === out[i]) out.push(it.id);
  return out;
}

/** Ancestors from nearest parent up to the root. */
export function ancestorIds(items: TreeItem[], id: number): number[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: number[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  while (cur != null && !out.includes(cur)) { out.push(cur); cur = byId.get(cur)?.parentId ?? null; }
  return out;
}

export function deckPath(items: TreeItem[], id: number): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  return [id, ...ancestorIds(items, id)].reverse().map((x) => byId.get(x)?.name ?? "?").join("::");
}

export function canMove(items: TreeItem[], id: number, newParentId: number | null): boolean {
  if (newParentId == null) return true;
  if (newParentId === id) return false;
  return !descendantIds(items, id).includes(newParentId);
}

export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return 1;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

export interface MovePlan { parentId: number | null; position: number; renumber: { id: number; position: number }[] }

/** Where to put `id` so it lands at `index` among the children of `newParentId`. */
export function planMove(items: TreeItem[], id: number, newParentId: number | null, index: number): MovePlan {
  if (!canMove(items, id, newParentId)) throw new Error("cycle");
  const siblings = items.filter((i) => i.parentId === newParentId && i.id !== id).sort(bySiblingOrder);
  const idx = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[idx - 1]?.position ?? null;
  const after = siblings[idx]?.position ?? null;
  if (before != null && after != null && after - before < 1e-9) {
    const ordered = [...siblings.slice(0, idx).map((s) => s.id), id, ...siblings.slice(idx).map((s) => s.id)];
    const renumber = ordered.filter((x) => x !== id).map((x) => ({ id: x, position: ordered.indexOf(x) + 1 }));
    return { parentId: newParentId, position: idx + 1, renumber };
  }
  return { parentId: newParentId, position: positionBetween(before, after), renumber: [] };
}

export function splitPath(path: string): string[] {
  return path.split("::").map((s) => s.trim()).filter(Boolean);
}

/** For "a::b::c": the deepest existing deck and the names that still need creating. */
export function planEnsurePath(items: TreeItem[], path: string): { existingId: number | null; create: string[] } {
  const segs = splitPath(path);
  let parent: number | null = null;
  let i = 0;
  for (; i < segs.length; i++) {
    const name = segs[i].toLowerCase();
    const found = items.find((it) => it.parentId === parent && it.name.toLowerCase() === name);
    if (!found) break;
    parent = found.id;
  }
  return { existingId: parent, create: segs.slice(i) };
}
