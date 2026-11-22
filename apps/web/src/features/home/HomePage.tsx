import { Link } from "react-router-dom";
import type { Rarity } from "@/api/types";
import { ownerColor, useInvitations, useTodayEvents } from "@/features/calendar/api";
import { RARITY_STYLE, useGachaCurrent } from "@/features/gacha/api";
import { useLatestLocations } from "@/features/location/api";
import { useAppSettings } from "@/features/settings/api";
import { useWishes } from "@/features/wishlist/api";
import { daysTogether, formatTime, greeting, taipeiDateKey, timeAgo } from "@/lib/date";
import { useUsers } from "@/lib/users";
import { useWsStatus } from "@/lib/ws";

export function HomePage() {
  const { me, partner, byId } = useUsers();
  const today = taipeiDateKey(new Date());
  const { data: wishes = [] } = useWishes();
  const { data: events = [] } = useTodayEvents(today);
  const { data: invitations = [] } = useInvitations();
  const { data: gacha } = useGachaCurrent();
  const { data: locations = [] } = useLatestLocations();
  const { data: settings } = useAppSettings();
  const ws = useWsStatus((s) => s.status);

  const open = wishes.filter((w) => w.done_at === null);
  const pending = invitations.filter((i) => i.to_user === me?.id && i.status === "pending");
  const partnerLoc = locations.find((l) => l.user_id === partner?.id);
  const d = gacha?.draw;

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <p className="text-stone-500">{greeting()}，</p>
        <h1 className="text-3xl font-bold">
          {me?.display_name} 💗 {partner?.display_name ?? ""}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-400">
          <span
            className={`size-1.5 rounded-full ${ws === "open" ? "bg-emerald-400" : "bg-stone-300"}`}
          />
          {ws === "open" ? "即時同步中" : "連線中…"}
        </p>
      </header>

      {settings?.anniversary ? (
        <div className="rounded-3xl bg-gradient-to-br from-brand-400 to-rose-400 p-5 text-white shadow-lg shadow-brand-500/20">
          <p className="text-sm opacity-90">我們在一起</p>
          <p className="text-5xl font-black tabular-nums">
            {daysTogether(settings.anniversary)}
            <span className="ml-1 text-xl font-semibold">天</span>
          </p>
          <p className="mt-1 text-xs opacity-80">
            從 {settings.anniversary.replaceAll("-", "/")} 開始
          </p>
        </div>
      ) : (
        <Link to="/more/settings" className="card block text-center text-sm text-stone-500">
          💞 設定交往紀念日，首頁會顯示在一起的天數
        </Link>
      )}

      {pending.length > 0 && (
        <Link
          to={`/calendar/invitations/${pending[0].id}`}
          className="flex items-center gap-3 rounded-2xl bg-rose-100 p-4 text-rose-900 shadow-sm"
        >
          <span className="animate-bounce text-3xl">💌</span>
          <div className="flex-1">
            <p className="font-semibold">你有 {pending.length} 封邀請函還沒回覆</p>
            <p className="text-sm opacity-80">{pending[0].title}</p>
          </div>
          <span>›</span>
        </Link>
      )}

      <Link to="/calendar" className="card block">
        <h2 className="mb-2 font-semibold">📅 今天的行程</h2>
        {events.length === 0 ? (
          <p className="text-sm text-stone-400">今天沒有行程</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {events.map((o) => (
              <li key={o.event.id + o.start} className="flex items-center gap-2">
                <span
                  className="h-4 w-1 rounded-full"
                  style={{ background: ownerColor(o, byId) }}
                />
                <span className="w-12 shrink-0 text-xs text-stone-500 tabular-nums">
                  {o.event.all_day ? "整天" : formatTime(o.start)}
                </span>
                <span className="truncate">{o.event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/gacha" className="card">
          <p className="text-sm font-semibold">🎰 本月扭蛋</p>
          {!d ? (
            <p className="text-xs text-stone-400">…</p>
          ) : d.status === "waiting" ? (
            <p className="mt-1 text-sm text-brand-500">{d.ready_users.length}/2 準備好了</p>
          ) : (
            <>
              {d.rarity && (
                <p
                  className="mt-1 text-lg font-black"
                  style={{ color: RARITY_STYLE[d.rarity as Rarity].color }}
                >
                  {d.rarity}
                </p>
              )}
              <p className="line-clamp-2 text-xs text-stone-600 dark:text-stone-300">
                {d.card_content}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {d.status === "done" ? "已完成 🏆" : d.status === "failed" ? "未完成" : "進行中"}
              </p>
            </>
          )}
          {gacha && gacha.streak > 0 && <p className="mt-1 text-xs">🔥 連續 {gacha.streak} 個月</p>}
        </Link>
        <Link to="/wishes" className="card">
          <p className="text-sm font-semibold">⭐ 願望清單</p>
          <p className="mt-1 text-3xl font-bold text-brand-500">{open.length}</p>
          <p className="text-xs text-stone-500">個等著我們・已完成 {wishes.length - open.length}</p>
        </Link>
      </div>

      <Link to="/more/location" className="card flex items-center gap-3">
        <span className="text-2xl">📍</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{partner?.display_name} 的最後報平安</p>
          <p className="truncate text-stone-500">
            {partnerLoc?.last_checkin
              ? `${timeAgo(partnerLoc.last_checkin.recorded_at)}：${partnerLoc.last_checkin.message}`
              : "還沒有報平安"}
          </p>
        </div>
        <span className="text-stone-300">›</span>
      </Link>
    </div>
  );
}
