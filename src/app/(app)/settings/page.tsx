"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import type { Me } from "@/components/Shell";

export default function SettingsPage() {
  const { t, err, toast, setLocale, setTheme, theme } = useApp();
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
    <div className="max-w-2xl space-y-5">
      <PageHeader title={t("settings")} />
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("account")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("email")}><Input value={me.email} disabled /></Field>
          <Field label={t("name")}><Input defaultValue={me.name} onBlur={(e) => e.target.value !== me.name && save({ name: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("appearance")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("language")}><Select className="w-full" value={me.settings.locale} onChange={(e) => { const l = e.target.value as "zh" | "en"; setLocale(l); save({ locale: l }); }}><option value="zh">中文</option><option value="en">English</option></Select></Field>
          <Field label={t("theme")}><Select className="w-full" value={theme} onChange={(e) => { const v = e.target.value as "light" | "dark" | "system"; setTheme(v); save({ theme: v }); }}><option value="light">{t("light")}</option><option value="dark">{t("dark")}</option><option value="system">{t("system")}</option></Select></Field>
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("studyDay")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("timezone")}><Select className="w-full" value={me.settings.timezone} onChange={(e) => save({ timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
          <Field label={t("rollover")} hint={t("rolloverHelp")}><Select className="w-full" value={me.settings.rolloverHour} onChange={(e) => save({ rolloverHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</Select></Field>
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("changePassword")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("currentPassword")}><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t("newPassword")} hint={t("passwordHint")}><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end"><Button onClick={async () => { try { await api("/api/auth/password", { body: pw }); setPw({ current: "", next: "" }); toast(t("saved")); } catch (e) { err(e); } }}>{t("save")}</Button></div>
      </Card>
      <Card className="border-again/30 p-5">
        <h2 className="text-sm font-semibold text-again">{t("dangerZone")}</h2>
        <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-sub">{t("deleteAccount")}</p><Button variant="danger" onClick={() => setDel(true)}>{t("delete")}</Button></div>
      </Card>
      <Modal open={del} onClose={() => setDel(false)} title={t("deleteAccount")}
        footer={<><Button variant="ghost" onClick={() => setDel(false)}>{t("cancel")}</Button><Button variant="danger" onClick={async () => { try { await api("/api/auth/account", { method: "DELETE", body: { password: delPw } }); window.location.href = "/register"; } catch (e) { err(e); } }}>{t("delete")}</Button></>}>
        <p className="mb-3 text-sm text-sub">{t("deleteAccountQ")}</p>
        <Input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder={t("password")} />
      </Modal>
    </div>
  );
}
