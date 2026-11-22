import { Link } from "react-router-dom";
import { useWishes } from "@/features/wishlist/api";
import { greeting, timeAgo } from "@/lib/date";
import { useUsers } from "@/lib/users";
import { useWsStatus } from "@/lib/ws";

export function HomePage() {
  const { me, partner, byId } = useUsers();
  const { data: wishes = [] } = useWishes();
  const ws = useWsStatus((s) => s.status);
  const open = wishes.filter((w) => w.done_at === null);
  const done = wishes.length - open.length;
  const recent = wishes.slice(0, 3);

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

      <Link to="/wishes" className="card block">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">願望清單</h2>
          <span className="text-sm text-stone-400">已完成 {done} 個</span>
        </div>
        <p className="mt-1 text-3xl font-bold text-brand-500">
          {open.length}
          <span className="ml-1 text-base font-normal text-stone-500">個等著我們</span>
        </p>
        {recent.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-black/5 pt-3 text-sm dark:border-white/10">
            {recent.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: byId.get(w.created_by)?.color }}
                />
                <span
                  className={`flex-1 truncate ${w.done_at ? "text-stone-400 line-through" : ""}`}
                >
                  {w.title}
                </span>
                <span className="text-xs text-stone-400">{timeAgo(w.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/calendar" className="card">
          <p className="text-2xl">📅</p>
          <p className="mt-2 font-semibold">今日行程</p>
          <p className="text-xs text-stone-400">即將推出</p>
        </Link>
        <Link to="/gacha" className="card">
          <p className="text-2xl">🎰</p>
          <p className="mt-2 font-semibold">本月扭蛋</p>
          <p className="text-xs text-stone-400">即將推出</p>
        </Link>
      </div>
    </div>
  );
}
