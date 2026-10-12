"use client";
/**
 * Shared UI primitives. Every page composes these; colors come only from the
 * design tokens (globals.css + tailwind.config.ts). No purple/indigo/violet.
 */
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X, Loader2 } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ─────────── Button ─────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "subtle";
const BTN_VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.18)] ring-1 ring-inset ring-black/[0.06] hover:bg-primary-strong dark:hover:bg-primary-strong dark:ring-white/10",
  secondary: "bg-surface text-fg border border-border shadow-xs hover:border-border-strong hover:bg-subtle",
  outline: "border border-border text-fg hover:bg-muted",
  subtle: "bg-muted text-fg hover:bg-border/70",
  ghost: "text-sub hover:bg-muted hover:text-fg",
  danger: "bg-danger text-white shadow-xs ring-1 ring-inset ring-black/10 hover:bg-danger/90 dark:text-zinc-950",
};
const BTN_SIZE = { sm: "h-11 px-3 text-[13px] gap-1.5 rounded-lg sm:h-8 sm:px-2.5", md: "h-11 px-4 text-[14px] gap-2 rounded-xl sm:h-9 sm:px-3.5 sm:text-[13.5px] sm:rounded-lg", lg: "h-12 px-5 text-[15px] gap-2 rounded-xl sm:h-11" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} disabled={disabled || loading}
        className={cx("focus-ring inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50", BTN_VARIANT[variant], BTN_SIZE[size], className)} {...rest}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  });

export function IconButton({ className, label, active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button aria-label={label} title={label}
      className={cx("focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 active:scale-95", active ? "bg-muted text-fg" : "text-sub hover:bg-muted hover:text-fg", "max-sm:h-11 max-sm:w-11", className)} {...rest}>
      {children}
    </button>
  );
}

/* ─────────── Form controls ─────────── */
const CONTROL = "focus-ring min-w-0 rounded-lg border border-border bg-surface text-base text-fg sm:text-[13.5px] shadow-xs placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:border-primary/60 disabled:cursor-not-allowed disabled:bg-muted disabled:text-sub";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(CONTROL, "h-11 w-full px-3 sm:h-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(CONTROL, "w-full px-3 py-2 leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL, "select-native h-11 cursor-pointer pl-3 sm:h-9", className)} {...rest}>{children}</select>;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-sub">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}

/* ─────────── Surfaces ─────────── */
export function Card({ className, children, interactive }: { className?: string; children: ReactNode; interactive?: boolean }) {
  return <div className={cx("rounded-2xl border border-border bg-surface shadow-card", interactive && "transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md", className)}>{children}</div>;
}

export function CardHeader({ icon, title, description, actions, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start gap-3", className)}>
      {icon}
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-faint">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/* ─────────── Tones: Pill / IconChip / Badge ─────────── */
export type Tone = "neutral" | "teal" | "sky" | "rose" | "amber" | "emerald" | "orange" | "primary" | "again" | "hard" | "easy" | "good";
const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-sub ring-border/70",
  teal: "bg-teal-500/10 text-teal-700 ring-teal-600/15 dark:text-teal-300 dark:ring-teal-400/20",
  primary: "bg-primary/10 text-primary-strong ring-primary/20",
  good: "bg-good/10 text-good ring-good/20",
  sky: "bg-sky-500/10 text-sky-700 ring-sky-600/15 dark:text-sky-300 dark:ring-sky-400/20",
  easy: "bg-sky-500/10 text-sky-700 ring-sky-600/15 dark:text-sky-300 dark:ring-sky-400/20",
  rose: "bg-rose-500/10 text-rose-700 ring-rose-600/15 dark:text-rose-300 dark:ring-rose-400/20",
  again: "bg-rose-500/10 text-rose-700 ring-rose-600/15 dark:text-rose-300 dark:ring-rose-400/20",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/20",
  hard: "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/20",
  emerald: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/15 dark:text-emerald-300 dark:ring-emerald-400/20",
  orange: "bg-orange-500/10 text-orange-700 ring-orange-600/15 dark:text-orange-300 dark:ring-orange-400/20",
};
export const toneClass = (t: Tone) => TONE[t];

export function Pill({ tone = "neutral", children, className, dot, mono, title }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; mono?: boolean; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", TONE[tone], mono && "num", className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

/** Badge = compact square-ish Pill (kept for existing call sites). */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", TONE[tone], className)}>{children}</span>;
}

/** Soft multi-tone icon chip for feature icons (sidebar nav icons stay grey). */
export function IconChip({ tone = "primary", children, size = "md", className }: { tone?: Tone; children: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "h-6 w-6 rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5", md: "h-8 w-8 rounded-lg [&>svg]:h-4 [&>svg]:w-4", lg: "h-11 w-11 rounded-xl [&>svg]:h-5 [&>svg]:w-5" }[size];
  return <span className={cx("inline-flex shrink-0 items-center justify-center ring-1 ring-inset", TONE[tone], s, className)}>{children}</span>;
}

/* ─────────── Progress ─────────── */
export function ProgressRing({ value, size = 28, stroke = 3, className, children, title }: { value: number; size?: number; stroke?: number; className?: string; children?: ReactNode; title?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-brand transition-[width] duration-500 ease-out" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/* ─────────── Segmented control ─────────── */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-lg border border-border bg-muted/60 p-0.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx("h-10 flex-1 whitespace-nowrap rounded-md px-3 text-[13px] transition-all duration-150 sm:h-8 sm:flex-none", value === o.value ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-sub hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────── Toggle ─────────── */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[13.5px] text-fg sm:min-h-0">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("focus-ring relative h-5 w-9 shrink-0 rounded-full shadow-inner transition-colors duration-200", checked ? "bg-primary" : "bg-border-strong")}>
        <span className={cx("absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      {label}
    </label>
  );
}

/* ─────────── Modal ─────────── */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center overflow-y-auto bg-zinc-950/40 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("max-h-[92dvh] w-full animate-rise-in overflow-y-auto rounded-t-3xl border border-border bg-elevated pb-[env(safe-area-inset-bottom)] shadow-hero sm:max-h-none sm:animate-scale-in sm:overflow-hidden sm:rounded-2xl sm:pb-0", wide ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-1 pt-3 sm:pt-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          <IconButton label="close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border bg-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ─────────── Misc ─────────── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-faint", className)} />;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-medium text-faint">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-fg">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[13.5px] text-sub">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, tone = "primary" }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; tone?: Tone }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong/70 bg-surface/50 px-6 py-16 text-center">
      <div className="bg-grid mask-radial pointer-events-none absolute inset-0" />
      {icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/10 blur-2xl" />
          <IconChip tone={tone} size="lg" className="shadow-md">{icon}</IconChip>
        </div>
      )}
      <p className="relative text-[14.5px] font-semibold text-fg">{title}</p>
      {children && <div className="relative mt-4 text-[13.5px] text-sub">{children}</div>}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-black/10 bg-black/[0.05] dark:border-white/15 dark:bg-white/10 px-1 font-mono text-[10.5px] font-medium leading-none opacity-70", className)}>{children}</kbd>;
}

export function Loading() {
  return <div className="flex justify-center py-24"><Spinner /></div>;
}
