"use client";
/** Settings: daily goal + FSRS auto-optimize, and Web Push study reminders. Rendered as two cards (fragment). */
import { useCallback, useEffect, useState } from "react";
import { BellRing, Target } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { tf, type FsrsKey } from "@/lib/i18n-fsrs";
import { currentSubscription, isIos, isStandalone, pushSupported, subscribePush, unsubscribePush } from "@/lib/push-client";
import { Button, Card, CardHeader, Field, IconChip, Input, Segmented, Select, Toggle } from "@/components/ui";
import type { StudyPrefs } from "@/core/reminders";

interface PushInfo { configured: boolean; publicKey: string | null; subscriptions: number }

export function StudyPrefsCards({ timezone }: { timezone: string }) {
  const { locale, err, toast, t: tMain } = useApp();
  const t = (k: FsrsKey, v?: Record<string, string | number>) => tf(locale, k, v);
  const [prefs, setPrefs] = useState<StudyPrefs | null>(null);
  const [push, setPush] = useState<PushInfo | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [denied, setDenied] = useState(false);

  const refreshPush = useCallback(async () => {
    const ok = pushSupported();
    setSupported(ok);
    if (ok) { setDenied(Notification.permission === "denied"); setSubscribed(!!(await currentSubscription().catch(() => null))); }
    setPush(await api<PushInfo>("/api/push").catch(() => null));
  }, []);
  useEffect(() => {
    api<{ prefs: StudyPrefs }>("/api/prefs").then((r) => setPrefs(r.prefs)).catch(err);
    refreshPush();
  }, [err, refreshPush]);

  const save = async (patch: Partial<StudyPrefs>) => {
    if (!prefs) return;
    setPrefs({ ...prefs, ...patch });
    try { const r = await api<{ prefs: StudyPrefs }>("/api/prefs", { method: "PATCH", body: patch }); setPrefs(r.prefs); toast(tMain("saved")); } catch (e) { err(e); }
  };

  const toggleReminder = async (on: boolean) => {
    if (!prefs) return;
    setBusy(true);
    try {
      if (on) {
        if (!push?.publicKey) { toast(t("remNotConfigured"), "error"); return; }
        const res = await subscribePush(push.publicKey);
        if (res === "denied") { setDenied(true); toast(t("remDenied"), "error"); return; }
      } else {
        await unsubscribePush();
      }
      await save({ reminderEnabled: on });
      await refreshPush();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await api<{ delivered: number }>("/api/push/test", { body: {} });
      toast(r.delivered > 0 ? t("remTestSent", { n: r.delivered }) : t("remTestNone"), r.delivered > 0 ? "ok" : "error");
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  if (!prefs) return null;
  const iosNeedsInstall = supported === false && isIos() && !isStandalone();
  return (
    <>
      <Card className="space-y-5 p-5">
        <CardHeader icon={<IconChip tone="teal"><Target /></IconChip>} title={t("goalCardTitle")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("goalType")}>
            <Segmented className="w-full" value={prefs.goalType} onChange={(v) => save({ goalType: v })} options={[{ value: "cards", label: t("goalCards") }, { value: "minutes", label: t("goalMinutes") }]} />
          </Field>
          <Field label={t("goalTarget")} hint={t("goalTargetHint")}>
            <Input type="number" min={0} max={1000} inputMode="numeric" defaultValue={prefs.goalTarget} key={`${prefs.goalType}-${prefs.goalTarget}`}
              onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n !== prefs.goalTarget) save({ goalTarget: n }); }} />
          </Field>
        </div>
        <div>
          <Toggle checked={prefs.autoOptimize} onChange={(v) => save({ autoOptimize: v })} label={t("autoOpt")} />
          <p className="mt-1 text-xs leading-5 text-faint">{t("autoOptHint")}</p>
        </div>
      </Card>
      <Card className="space-y-5 p-5">
        <CardHeader icon={<IconChip tone="orange"><BellRing /></IconChip>} title={t("remTitle")} description={t("remDesc")} />
        {!supported ? (
          <p className="rounded-lg border border-border bg-subtle px-3 py-2.5 text-[13px] text-sub">{iosNeedsInstall ? t("remIos") : t("remUnsupported")}</p>
        ) : (
          <>
            {push && !push.configured && <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-sub">{t("remNotConfigured")}</p>}
            {denied && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-sub">{t("remDenied")}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Toggle checked={prefs.reminderEnabled} onChange={toggleReminder} label={t("remEnable")} />
              {prefs.reminderEnabled && !subscribed && push?.configured && <Button size="sm" loading={busy} onClick={() => toggleReminder(true)}>{t("remThisDeviceEnable")}</Button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("remHour")} hint={t("remHourHint", { tz: timezone })}>
                <Select className="w-full" value={prefs.reminderHour} onChange={(e) => save({ reminderHour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </Select>
              </Field>
              <div className="flex items-end"><Toggle checked={prefs.reminderQuiet} onChange={(v) => save({ reminderQuiet: v })} label={t("remQuiet")} /></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-faint">{subscribed ? t("remThisDevice") : ""}{push ? `${subscribed ? " · " : ""}${t("remDevices", { n: push.subscriptions })}` : ""}</span>
              <Button size="sm" loading={busy} disabled={!push?.subscriptions || !push.configured} onClick={test}>{t("remTest")}</Button>
            </div>
            <p className="text-xs leading-5 text-faint">{t("remDailyNote")}</p>
          </>
        )}
      </Card>
    </>
  );
}
