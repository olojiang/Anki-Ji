"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { User, Palette, CalendarClock, KeyRound, AlertTriangle } from "lucide-react";
import { Button, Card, CardHeader, Field, IconChip, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { ThemeGrid } from "@/components/ThemePicker";
import { ReadingSettingsCard } from "@/components/share-ir/ReadingSettingsCard";
import type { Me } from "@/components/Shell";

export default function SettingsPage() {
  const { t, err, toast, setLocale } = useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState("");
  useEffect(() => { api<{ user: Me }>("/api/auth/me").then((r) => setMe(r.user)).catch(err); }, [err]);
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone"); } catch { return ["Asia/Shanghai", "UTC"]; } }, []);
  if (!me) return <div className="flex justify-center py-20"><Spinner /></div>;
  const save = async (patch: Partial<Me["settings"]> & { name?: string }) => {
    try {
      const { name, ...settings } = patch;
      const r = await api<{ user: Me }>("/api/auth/me", { method: "PATCH", body: { name, settings } });
      setMe(r.user); toast(t("saved"));
    } catch (e) { err(e); }
  };
  return (
    <div className="max-w-3xl xl:max-w-none">
      <PageHeader title={t("settings")} />
      <div className="max-xl:space-y-4 xl:columns-2 xl:gap-5 [&>*]:break-inside-avoid xl:[&>*]:mb-5 xl:[&>*]:inline-block xl:[&>*]:w-full xl:[&>*]:align-top">
      <Card className="space-y-5 p-5">
        <CardHeader icon={<IconChip tone="sky"><User /></IconChip>} title={t("account")} description={me.email} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("email")}><Input value={me.email} disabled /></Field>
          <Field label={t("name")}><Input defaultValue={me.name} onBlur={(e) => e.target.value !== me.name && save({ name: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="space-y-5 p-5">
        <CardHeader icon={<IconChip tone="amber"><Palette /></IconChip>} title={t("appearance")} description={t("themeHint")} />
        <div>
          <span className="mb-2 block text-[12.5px] font-medium text-sub">{t("theme")}</span>
          <ThemeGrid />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("language")}><Select className="w-full" value={me.settings.locale} onChange={(e) => { const l = e.target.value as "zh" | "en"; setLocale(l); save({ locale: l }); }}><option value="zh">中文</option><option value="en">English</option></Select></Field>
        </div>
      </Card>
      <Card className="space-y-5 p-5">
        <CardHeader icon={<IconChip tone="emerald"><CalendarClock /></IconChip>} title={t("studyDay")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("timezone")}><Select className="w-full" value={me.settings.timezone} onChange={(e) => save({ timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
          <Field label={t("rollover")} hint={t("rolloverHelp")}><Select className="w-full" value={me.settings.rolloverHour} onChange={(e) => save({ rolloverHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</Select></Field>
        </div>
      </Card>
      <ReadingSettingsCard />
      <Card className="space-y-5 p-5">
        <CardHeader icon={<IconChip tone="orange"><KeyRound /></IconChip>} title={t("changePassword")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("currentPassword")}><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t("newPassword")} hint={t("passwordHint")}><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end"><Button onClick={async () => { try { await api("/api/auth/password", { body: pw }); setPw({ current: "", next: "" }); toast(t("saved")); } catch (e) { err(e); } }}>{t("save")}</Button></div>
      </Card>
      <Card className="border-danger/30 p-5">
        <CardHeader icon={<IconChip tone="rose"><AlertTriangle /></IconChip>} title={<span className="text-danger">{t("dangerZone")}</span>} />
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-subtle px-4 py-3"><p className="text-[13.5px] text-sub">{t("deleteAccount")}</p><Button variant="danger" onClick={() => setDel(true)}>{t("delete")}</Button></div>
      </Card>
      </div>
      <Modal open={del} onClose={() => setDel(false)} title={t("deleteAccount")}
        footer={<><Button variant="ghost" onClick={() => setDel(false)}>{t("cancel")}</Button><Button variant="danger" onClick={async () => { try { await api("/api/auth/account", { method: "DELETE", body: { password: delPw } }); window.location.href = "/register"; } catch (e) { err(e); } }}>{t("delete")}</Button></>}>
        <p className="mb-3 text-sm text-sub">{t("deleteAccountQ")}</p>
        <Input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder={t("password")} />
      </Modal>
    </div>
  );
}
