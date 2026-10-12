"use client";
import { useCallback } from "react";
import { useApp } from "../providers";
import { siError, tsi, type SiKey } from "@/lib/i18n-share-ir";

/** App context + sharing/reading strings (`s`) + an error toaster that knows our error codes (`fail`). */
export function useSi() {
  const app = useApp();
  const { locale, toast, err } = app;
  const s = useCallback((k: SiKey, v?: Record<string, string | number>) => tsi(locale, k, v), [locale]);
  const fail = useCallback((e: unknown) => { const m = siError(locale, e); if (m) toast(m, "error"); else err(e); }, [locale, toast, err]);
  return { ...app, s, fail };
}
