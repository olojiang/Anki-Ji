/** Anki's leech rule: at `threshold` lapses, then every half-threshold after that. */
export function isLeech(lapses: number, threshold: number): boolean {
  if (threshold <= 0 || lapses < threshold) return false;
  const every = Math.max(1, Math.ceil(threshold / 2));
  return (lapses - threshold) % every === 0;
}
