"use client";

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) window.location.href = "/login";
    throw new ApiError(res.status, (data as { error?: string }).error ?? "error");
  }
  return data as T;
}

export async function uploadFile(file: Blob, filename?: string): Promise<{ url: string; id: number }> {
  const fd = new FormData();
  fd.append("file", file, filename ?? (file as File).name ?? "file");
  if (filename) fd.append("filename", filename);
  const res = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error");
  return data;
}

export function download(name: string, content: string | Blob, type = "application/json") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
