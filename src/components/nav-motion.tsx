"use client";
/** Navigation motion: a nav container with a sliding active indicator, and link clicks that run inside a View Transition. */
import { useRouter } from "next/navigation";
import { useCallback, useRef, type ReactNode } from "react";
import { navigateWithTransition, useSlidingIndicator } from "./motion";
import { cx } from "./ui";

/** onClick for internal nav links: plain clicks navigate inside a view transition; modified clicks behave natively. */
export function useTransitionNav() {
  const router = useRouter();
  return useCallback((href: string, current: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || href === current) return;
    e.preventDefault();
    navigateWithTransition(() => router.push(href));
  }, [router]);
}

/**
 * <nav> whose children mark the current item with data-active="true"; an absolutely positioned
 * pill (`indicatorClassName`, under the labels) and accent layer (`indicator` inside `barClassName`)
 * slide to it. Only the accent layer carries a view-transition-name, so during a route View
 * Transition it morphs on top without covering the labels. `activeKey` changes with the active item.
 */
export function SlidingNav({ activeKey, className, indicatorClassName, barClassName, indicator, axis = "y", children, ...rest }: { activeKey: unknown; className?: string; indicatorClassName?: string; barClassName?: string; indicator?: ReactNode; axis?: "y" | "both"; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const ind = useSlidingIndicator(ref, activeKey, axis);
  return (
    <nav ref={ref} className={cx("relative", className)} {...rest}>
      {children}
      <span aria-hidden data-ready={ind.ready} style={ind.style} className={cx("m-indicator pointer-events-none absolute top-0 z-0 !mt-0", indicatorClassName)} />
      {indicator && <span aria-hidden data-ready={ind.ready} style={ind.style} className={cx("m-indicator pointer-events-none absolute top-0 z-0 !mt-0", barClassName)}>{indicator}</span>}
    </nav>
  );
}
