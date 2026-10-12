"use client";
import { useState } from "react";
import { AudioLines } from "lucide-react";
import { useApp } from "@/components/providers";
import { Card, CardHeader, Field, IconChip, Select } from "@/components/ui";
import { ta } from "@/lib/i18n-ai";
import { ttsSupported } from "@/lib/tts";
import { NOTE_TYPES } from "@/core/types";
import { TtsScopeEditor } from "./TtsScopeEditor";

/** Settings page section: default TTS options + per-note-type overrides. */
export function TtsSettingsCard() {
  const { t, locale } = useApp();
  const T = (k: string, v?: Record<string, string | number>) => ta(locale, k, v);
  const [scope, setScope] = useState("default");
  const supported = typeof window !== "undefined" && ttsSupported();
  return (
    <Card className="space-y-5 p-5" >
      <CardHeader icon={<IconChip tone="teal"><AudioLines /></IconChip>} title={T("ttsTitle")} description={T("ttsDesc")} />
      {!supported && <p className="rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs text-sub">{T("ttsUnsupported")}</p>}
      <Field label={T("ttsScope")}>
        <Select className="w-full" value={scope} onChange={(e) => setScope(e.target.value)} data-testid="tts-scope">
          <option value="default">{T("ttsDefault")}</option>
          {NOTE_TYPES.map((x) => <option key={x} value={`type:${x}`}>{T("ttsForType", { type: t(`t_${x}`) })}</option>)}
        </Select>
      </Field>
      <TtsScopeEditor key={scope} scope={scope} />
      <p className="text-[11.5px] leading-relaxed text-faint">{T("ttsMarkers")}</p>
    </Card>
  );
}
