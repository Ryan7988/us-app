import clsx from "clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { EventOut, Occurrence } from "@/api/types";
import { PlusIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { addDays, formatTime, monthGrid, taipeiDateKey } from "@/lib/date";
import { useUsers } from "@/lib/users";
import { ownerColor, ownerLabel, SHARED_COLOR, useEvents, useInvitations } from "./api";
import { EventForm } from "./EventForm";
import { InvitationForm } from "./InvitationForm";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** 一個行程（可能跨日）落在哪些日期 */
function daysOf(o: Occurrence): string[] {
  const first = taipeiDateKey(new Date(o.start));
  // 結束時間是「不含」的：整天行程 12/5 00:00 → 12/6 00:00 只算 12/5
  const last = taipeiDateKey(new Date(new Date(o.end).getTime() - 1));
  const out = [first];
  for (let d = first; d < last && out.length < 42;) {
    d = addDays(d, 1);
    out.push(d);
  }
  return out;
}

export function CalendarPage() {
  const today = taipeiDateKey(new Date());
  const [ym, setYm] = useState(() => ({
    y: Number(today.slice(0, 4)),
    m: Number(today.slice(5, 7)),
  }));
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<EventOut | "new" | null>(null);
  const [inviting, setInviting] = useState(false);
  const { me, partner, byId } = useUsers();

  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const { data: occ = [] } = useEvents(grid[0], addDays(grid[41], 1));
  const { data: invitations = [] } = useInvitations();
  const pendingInbox = invitations.filter(
    (i) => i.to_user === me?.id && i.status === "pending",
  ).length;

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occ) for (const d of daysOf(o)) m.set(d, [...(m.get(d) ?? []), o]);
    return m;
  }, [occ]);
  const dayEvents = byDay.get(selected) ?? [];

  const shift = (n: number) =>
    setYm(({ y, m }) => {
      const t = y * 12 + (m - 1) + n;
      return { y: Math.floor(t / 12), m: (t % 12) + 1 };
    });

  return (
    <>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={() => shift(-1)} aria-label="上個月">
            ‹
          </button>
          <h1 className="text-2xl font-bold tabular-nums">
            {ym.y} 年 {ym.m} 月
          </h1>
          <button className="btn-ghost px-2" onClick={() => shift(1)} aria-label="下個月">
            ›
          </button>
        </div>
        <button
          className="btn-primary size-10 rounded-full p-0"
          aria-label="新增行程"
          onClick={() => setEditing("new")}
        >
          <PlusIcon />
        </button>
      </header>

      <div className="mb-3 flex gap-2">
        <Link
          to="/calendar/invitations"
          className="btn-ghost relative flex-1 bg-white ring-1 ring-black/5 dark:bg-stone-800"
        >
          📬 邀請函
          {pendingInbox > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {pendingInbox}
            </span>
          )}
        </Link>
        <button
          className="btn-ghost flex-1 bg-white ring-1 ring-black/5 dark:bg-stone-800"
          onClick={() => setInviting(true)}
        >
          💌 寄邀請函
        </button>
        {(ym.y !== Number(today.slice(0, 4)) || ym.m !== Number(today.slice(5, 7))) && (
          <button
            className="btn-ghost bg-white px-3 ring-1 ring-black/5 dark:bg-stone-800"
            onClick={() => {
              setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
              setSelected(today);
            }}
          >
            今天
          </button>
        )}
      </div>

      <div className="card p-2">
        <div className="grid grid-cols-7 text-center text-xs text-stone-400">
          {WEEK.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((d) => {
            const inMonth = Number(d.slice(5, 7)) === ym.m;
            const evs = byDay.get(d) ?? [];
            const colors = [...new Set(evs.map((o) => ownerColor(o, byId)))].slice(0, 3);
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                aria-label={d}
                className={clsx(
                  "flex h-12 flex-col items-center justify-start rounded-xl pt-1 transition",
                  selected === d && "bg-brand-100 dark:bg-brand-500/20",
                  !inMonth && "opacity-35",
                )}
              >
                <span
                  className={clsx(
                    "flex size-7 items-center justify-center rounded-full text-sm tabular-nums",
                    d === today && "bg-brand-500 font-bold text-white",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="mt-0.5 flex gap-0.5">
                  {colors.map((c) => (
                    <span key={c} className="size-1.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-center gap-4 border-t border-black/5 pt-2 text-xs text-stone-500 dark:border-white/10">
          {[
            [me?.display_name, me?.color],
            [partner?.display_name, partner?.color],
            ["共同", SHARED_COLOR],
          ].map(([n, c]) => (
            <span key={String(n)} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: c ?? "#ccc" }} />
              {n}
            </span>
          ))}
        </div>
      </div>

      <h2 className="mt-5 mb-2 font-semibold">
        {Number(selected.slice(5, 7))} 月 {Number(selected.slice(8))} 日
        {selected === today && (
          <span className="ml-2 text-sm font-normal text-brand-500">今天</span>
        )}
      </h2>
      {dayEvents.length === 0 ? (
        <button
          className="w-full rounded-2xl border-2 border-dashed border-stone-200 py-6 text-sm text-stone-400 dark:border-stone-700"
          onClick={() => setEditing("new")}
        >
          這天沒有行程，點這裡新增
        </button>
      ) : (
        <ul className="space-y-2">
          {dayEvents.map((o) => (
            <li key={o.event.id + o.start}>
              <button
                className="card flex w-full items-center gap-3 text-left"
                onClick={() => setEditing(o.event)}
              >
                <span
                  className="h-10 w-1 shrink-0 rounded-full"
                  style={{ background: ownerColor(o, byId) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{o.event.title}</p>
                  <p className="text-xs text-stone-500">
                    {o.event.all_day ? "整天" : `${formatTime(o.start)} – ${formatTime(o.end)}`}
                    {o.event.location && `・📍 ${o.event.location}`}
                    {o.event.rrule && "・🔁"}
                    {o.event.source_invitation_id && "・💌"}
                  </p>
                </div>
                <span className="text-xs text-stone-400">{ownerLabel(o, me?.id, byId)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "新增行程" : "編輯行程"}
      >
        {editing !== null && (
          <EventForm
            key={editing === "new" ? `new-${selected}` : editing.id}
            event={editing === "new" ? null : editing}
            dayKey={selected}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
      <Sheet open={inviting} onClose={() => setInviting(false)} title="寫邀請函">
        {inviting && <InvitationForm onDone={() => setInviting(false)} />}
      </Sheet>
    </>
  );
}
