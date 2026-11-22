export const TZ = "Asia/Taipei";

/** 「3 分鐘前」「昨天」這類相對時間 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "剛剛";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

/** 台北時間的 YYYY-MM-DD */
export function taipeiDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** 從 start（YYYY-MM-DD，台北日期）到今天是第幾天，當天算第 1 天 */
export function daysTogether(start: string, now: Date = new Date()): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${taipeiDateKey(now)}T00:00:00Z`);
  return Math.floor((b - a) / 86400000) + 1;
}

export function greeting(now: Date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(now),
  );
  if (h < 5) return "夜深了";
  if (h < 11) return "早安";
  if (h < 14) return "午安";
  if (h < 18) return "午後好";
  return "晚安";
}
