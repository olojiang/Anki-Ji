"use client";
/** Settings → Appearance: "Reduce motion" (system | reduce | full). Stored per device; applies instantly. */
import { useEffect, useState } from "react";
import { useApp } from "./providers";
import { Segmented } from "./ui";
import { useMotionPref } from "./motion";
import { tm } from "@/lib/i18n-motion";
import type { MotionPref } from "@/core/motion";

export function MotionSetting() {
  const { locale } = useApp();
  const [pref, setPref] = useMotionPref();
  const [sysReduce, setSysReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSysReduce(mq.matches);
    const h = () => setSysReduce(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return (
    <div data-testid="motion-setting">
      <span className="mb-1.5 block text-[12.5px] font-medium text-sub">{tm(locale, "motionTitle")}</span>
      <Segmented<MotionPref> className="w-full sm:w-auto" value={pref} onChange={setPref}
        options={[{ value: "system", label: tm(locale, "motionSystem") }, { value: "reduce", label: tm(locale, "motionReduce") }, { value: "full", label: tm(locale, "motionFull") }]} />
      <span className="mt-1.5 block text-xs leading-relaxed text-faint">
        {tm(locale, "motionHint")}{pref === "system" && <> · {tm(locale, "motionSystemNow", { v: tm(locale, sysReduce ? "motionOn" : "motionOff") })}</>}
      </span>
    </div>
  );
}
