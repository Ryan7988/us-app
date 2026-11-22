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

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, ...opts });

export function formatTime(iso: string): string {
  return fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return fmt({
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatMonthDay(iso: string): string {
  return fmt({ month: "numeric", day: "numeric", weekday: "short" }).format(new Date(iso));
}

/** 台北時間某天 00:00 的 Date（YYYY-MM-DD） */
export function taipeiMidnight(key: string): Date {
  return new Date(`${key}T00:00:00+08:00`);
}

export function addDays(key: string, n: number): string {
  const d = taipeiMidnight(key);
  d.setUTCDate(d.getUTCDate() + n);
  return taipeiDateKey(d);
}

/** 月曆格子：從該月 1 號所在週的週日開始，共 42 天 */
export function monthGrid(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const dow = new Date(`${first}T12:00:00+08:00`).getUTCDay();
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** <input type="datetime-local"> 的值（台北時間） */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return parts.replace(" ", "T");
}

/** datetime-local 值（台北時間）→ ISO 字串 */
export function fromLocalInput(v: string): string {
  return new Date(`${v}:00+08:00`).toISOString();
}

export function minutesAgo(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
}
