/** Strings for the motion setting: [中文, English]. Kept separate from the main dictionary to avoid merge churn. */
import type { Locale } from "./i18n";

export const MOTION_DICT = {
  motionTitle: ["动效", "Motion"],
  motionHint: ["减少动效：只保留淡入淡出，关闭位移、翻转与滑动动画。默认跟随系统设置。", "Reduce motion keeps only gentle fades — no sliding, flipping or movement. Follows your system setting by default."],
  motionSystem: ["跟随系统", "System"],
  motionReduce: ["减少动效", "Reduce motion"],
  motionFull: ["完整动效", "Full motion"],
  motionSystemNow: ["系统当前：{v}", "System is currently: {v}"],
  motionOn: ["减少", "reduced"],
  motionOff: ["完整", "full"],
} as const satisfies Record<string, readonly [string, string]>;

export type MotionKey = keyof typeof MOTION_DICT;
export function tm(locale: Locale, key: MotionKey, vars?: Record<string, string | number>): string {
  let s: string = MOTION_DICT[key][locale === "en" ? 1 : 0];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
