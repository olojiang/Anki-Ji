"use client";
/** Session-complete moment: progress ring fills, the reviewed count counts up, a check pops in. One soft glow, no confetti. */
import { useEffect, useState, type ReactNode } from "react";
import { Check, Clock, PartyPopper } from "lucide-react";
import { CountUp } from "../motion";
import { IconChip, ProgressRing } from "../ui";

export function SessionComplete({ done, waiting, children }: { done: number; waiting: boolean; children: ReactNode }) {
  const [fill, setFill] = useState(0);
  useEffect(() => { const h = requestAnimationFrame(() => setFill(1)); return () => cancelAnimationFrame(h); }, []);
  if (waiting || done === 0) {
    return (
      <>
        <IconChip tone={waiting ? "amber" : "primary"} size="lg" className="m-pop relative mb-5 h-14 w-14 rounded-2xl shadow-md [&>svg]:h-7 [&>svg]:w-7">{waiting ? <Clock /> : <PartyPopper />}</IconChip>
        {children}
      </>
    );
  }
  return (
    <>
      <div className="relative mb-5" data-testid="session-ring">
        <span aria-hidden className="m-glow pointer-events-none absolute inset-0 rounded-full bg-primary/25 blur-xl" style={{ animationDelay: "650ms" }} />
        <ProgressRing value={fill} size={104} stroke={6} className="relative [&_circle:last-child]:duration-1000">
          <span className="flex flex-col items-center leading-none">
            <CountUp value={done} duration={900} className="num text-[28px] font-semibold text-fg" />
            <span className="m-pop mt-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg" style={{ animationDelay: "900ms" }}><Check className="h-3 w-3" strokeWidth={3} /></span>
          </span>
        </ProgressRing>
      </div>
      {children}
    </>
  );
}
