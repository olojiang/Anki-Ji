"use client";
/** Settings card: daily cap for the incremental reading queue. */
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, Field, IconChip, Input } from "../ui";
import { useSi } from "./useSi";

export function ReadingSettingsCard() {
  const { s, t, toast, fail } = useSi();
  const [cap, setCap] = useState<string>("");
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => { api<{ prefs: { dailyCap: number } }>("/api/reading/prefs").then((r) => { setCap(String(r.prefs.dailyCap)); setSaved(r.prefs.dailyCap); }).catch(() => {}); }, []);
  const save = async () => {
    const n = Number(cap);
    if (!Number.isFinite(n) || n === saved) { setCap(String(saved ?? "")); return; }
    try { const r = await api<{ prefs: { dailyCap: number } }>("/api/reading/prefs", { method: "PATCH", body: { dailyCap: n } }); setCap(String(r.prefs.dailyCap)); setSaved(r.prefs.dailyCap); toast(t("saved")); } catch (e) { fail(e); }
  };
  return (
    <Card className="space-y-5 p-5">
      <CardHeader icon={<IconChip tone="teal"><BookOpen /></IconChip>} title={s("readingSettings")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={s("dailyCap")} hint={s("dailyCapHint")}>
          <Input type="number" min={1} max={500} value={cap} disabled={saved == null} onChange={(e) => setCap(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} data-testid="reading-cap" />
        </Field>
      </div>
    </Card>
  );
}
