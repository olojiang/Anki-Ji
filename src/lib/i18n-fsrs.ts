/** Strings for FSRS auto-optimization, retention simulator, response time, reminders and daily goal: [中文, English]. */
import type { Locale } from "./i18n";

export const FSRS_DICT = {
  // simulator
  simTitle: ["保留率模拟器", "Retention simulator"],
  simDesc: ["按当前参数和牌组模拟未来 365 天的每日工作量与掌握量", "Simulates daily workload and retained knowledge for the next 365 days with the current parameters and cards"],
  simReviews: ["复习/天", "Reviews/day"], simMinutes: ["分钟/天", "Minutes/day"],
  simMemorized: ["一年后掌握", "Memorized in 1 year"], simCost: ["每张掌握卡耗时", "Time per memorized card"],
  simOptimal: ["推荐保留率 {r}", "Optimal retention {r}"],
  simOptimalHint: ["使“每张掌握卡片的学习时间”最少的保留率", "The retention that minimizes study time per memorized card"],
  simUse: ["使用", "Use"], simRunning: ["模拟中…", "Simulating…"],
  simAt: ["保留率 {r} 时", "At retention {r}"],
  simCostsUser: ["耗时依据你的作答记录：新卡 {l}s · 记住 {p}s · 遗忘 {f}s", "Costs from your answer times: learn {l}s · pass {p}s · fail {f}s"],
  simCostsDefault: ["复习记录不足，使用默认耗时：新卡 {l}s · 记住 {p}s · 遗忘 {f}s", "Not enough history — default costs: learn {l}s · pass {p}s · fail {f}s"],
  simCollection: ["{n} 张新卡 · {r} 张复习卡 · 每日新卡 {d}", "{n} new · {r} in review · {d} new/day"],
  simEmpty: ["牌组里还没有可模拟的卡片", "No cards to simulate in this deck yet"],
  simYear: ["未来一年每周平均", "Weekly average over the next year"],
  simKnowledge: ["掌握量", "Knowledge"], simWorkload: ["工作量", "Workload"],
  simUnitCards: ["张", "cards"], simUnitMin: ["分钟", "min"], simUnitSec: ["秒", "s"],
  // param history
  histTitle: ["参数版本", "Parameter versions"],
  histDesc: ["每次优化都会记录 log-loss 与 RMSE（越低越好）；可随时恢复", "Each optimization records log-loss and RMSE (lower is better); restore any version"],
  histEmpty: ["还没有优化记录", "No optimizations yet"],
  srcManual: ["手动", "Manual"], srcAuto: ["自动", "Auto"], srcRevert: ["恢复", "Restore"],
  histAdopted: ["已采用", "Adopted"], histRejected: ["未采用（未改进）", "Kept old (no improvement)"], histSkipped: ["数据不足", "Not enough data"],
  histUse: ["使用此版本", "Use these"], histPrev: ["恢复之前的", "Restore previous"],
  histApplied: ["参数已应用到此牌组及子牌组", "Parameters applied to this deck and its sub-decks"],
  histDefault: ["默认参数", "default parameters"],
  autoOptOn: ["自动优化已开启：每累计 400 次新复习且距上次 ≥7 天会自动重新训练，只采用更好的参数", "Auto-optimize is on: retrains after 400 new reviews and ≥7 days, adopting only better parameters"],
  autoOptOff: ["自动优化已关闭（可在设置中开启）", "Auto-optimize is off (enable it in Settings)"],
  // settings
  goalCardTitle: ["每日目标与优化", "Daily goal & optimization"],
  goalType: ["目标类型", "Goal type"], goalCards: ["卡片数", "Cards"], goalMinutes: ["分钟", "Minutes"],
  goalTarget: ["每日目标", "Daily target"], goalTargetHint: ["设为 0 关闭目标", "Set 0 to turn the goal off"],
  autoOpt: ["自动优化 FSRS 参数", "Auto-optimize FSRS parameters"],
  autoOptHint: ["每个顶层牌组累计 ≥400 次新复习且距上次 ≥7 天时，在学习结束后或每日自动重新训练；只有 log-loss 降低且 RMSE 不变差时才采用", "Each top-level deck is retrained after ≥400 new reviews and ≥7 days (after a session or daily); new parameters are adopted only if log-loss drops and RMSE doesn't worsen"],
  remTitle: ["学习提醒", "Study reminders"],
  remDesc: ["通过浏览器推送通知提醒你每日复习", "Daily push notification to keep you reviewing"],
  remEnable: ["开启每日提醒", "Daily reminder"], remHour: ["提醒时间", "Reminder time"],
  remHourHint: ["按设置中的时区 {tz}", "In your timezone {tz}"],
  remQuiet: ["没有待复习卡片时不提醒", "Stay quiet when nothing is due"],
  remTest: ["发送测试通知", "Send test notification"], remTestSent: ["已发送到 {n} 个设备", "Sent to {n} device(s)"],
  remTestNone: ["没有已订阅的设备", "No subscribed devices"],
  remUnsupported: ["此浏览器不支持推送通知", "This browser doesn't support push notifications"],
  remIos: ["iPhone / iPad 需先“添加到主屏幕”，再从主屏幕图标打开后开启提醒", "On iPhone/iPad, add Anki-ji to your Home Screen and open it from there to enable reminders"],
  remDenied: ["通知权限被拒绝，请在浏览器设置中允许", "Notifications are blocked — allow them in your browser settings"],
  remNotConfigured: ["服务器尚未配置推送密钥（VAPID）", "Push isn't configured on the server yet (VAPID keys)"],
  remDevices: ["已订阅设备：{n}", "Subscribed devices: {n}"],
  remThisDevice: ["本设备已订阅", "This device is subscribed"],
  remDailyNote: ["提醒每日最多一次；在提醒时间之后的下一次定时任务发送", "At most once a day, sent by the next scheduled run after your reminder time"],
  // goal card
  goalToday: ["今日目标", "Today's goal"], goalDone: ["已完成", "Goal met"],
  goalStreak: ["连续达标 {n} 天", "{n}-day goal streak"], goalOff: ["未设置每日目标", "No daily goal set"],
  goalSet: ["设置目标", "Set a goal"], goalLeft: ["还差 {n}", "{n} to go"],
  // response time
  rtTitle: ["作答时间", "Answer time"],
  rtDesc: ["仅用于统计，不影响评分与调度；超过 60 秒的作答视为走神，计时按 60 秒封顶", "For insight only — never affects ratings or scheduling. Answers over 60 s count as idle and are capped at 60 s"],
  rtMedian: ["中位数", "Median"], rtMean: ["平均", "Mean"], rtTotal: ["学习总时长", "Total study time"],
  rtLong: ["超长作答", "Very long answers"], rtByRating: ["按评分", "By rating"],
  rtSlow: ["耗时最长的卡片", "Slowest cards"], rtSlowHint: ["中位作答时间 ≥15 秒且为整体的 2.5 倍以上，可能需要拆分或改写", "Median ≥15 s and ≥2.5× your usual — consider splitting or rewording"],
  rtNone: ["还没有计时数据", "No timing data yet"], rtHours: ["小时", "h"], rtLast30: ["近 30 天", "Last 30 days"],
  rtReviews: ["{n} 次", "{n} reviews"],
} as const;

export type FsrsKey = keyof typeof FSRS_DICT;

export function tf(locale: Locale, key: FsrsKey, vars?: Record<string, string | number>): string {
  const e = FSRS_DICT[key];
  let s: string = e ? e[locale === "en" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
