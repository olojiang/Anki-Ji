export interface TypedSegment { text: string; kind: "ok" | "wrong" | "missing" }

/** Character diff (LCS) between what the user typed and the expected answer. */
export function compareTyped(typed: string, expected: string): { correct: boolean; segments: TypedSegment[] } {
  const a = typed.trim(), b = expected.trim();
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (al === bl) return { correct: true, segments: [{ text: b, kind: "ok" }] };
  const m = al.length, n = bl.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const segs: TypedSegment[] = [];
  const push = (text: string, kind: TypedSegment["kind"]) => {
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) last.text += text; else segs.push({ text, kind });
  };
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && al[i] === bl[j]) { push(b[j], "ok"); i++; j++; }
    else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) { push(b[j], "missing"); j++; }
    else { push(a[i], "wrong"); i++; }
  }
  return { correct: false, segments: segs };
}
