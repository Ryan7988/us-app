import clsx from "clsx";
import { useState, type FormEvent } from "react";
import type { EventOut, OwnerKind } from "@/api/types";
import { addDays, fromLocalInput, taipeiDateKey, toLocalInput } from "@/lib/date";
import { useOnline } from "@/lib/online";
import { useUsers } from "@/lib/users";
import { SHARED_COLOR, useDeleteEvent, useSaveEvent } from "./api";

const REPEATS = [
  { v: "", label: "不重複" },
  { v: "FREQ=WEEKLY", label: "每週" },
  { v: "FREQ=MONTHLY", label: "每月" },
  { v: "FREQ=YEARLY", label: "每年" },
];
const REMINDERS = [
  { v: null, label: "不提醒" },
  { v: 0, label: "準時" },
  { v: 30, label: "30 分鐘前" },
  { v: 60, label: "1 小時前" },
  { v: 1440, label: "1 天前" },
];

export function EventForm({
  event,
  dayKey,
  onDone,
}: {
  event: EventOut | null;
  dayKey: string;
  onDone: () => void;
}) {
  const { me, partner } = useUsers();
  const online = useOnline();
  const save = useSaveEvent();
  const del = useDeleteEvent();
  const initialOwner: OwnerKind = !event
    ? "shared"
    : event.owner_id === null
      ? "shared"
      : event.owner_id === me?.id
        ? "me"
        : "partner";
  const [title, setTitle] = useState(event?.title ?? "");
  const [owner, setOwner] = useState<OwnerKind>(initialOwner);
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(event ? toLocalInput(event.start_at) : `${dayKey}T19:00`);
  const [end, setEnd] = useState(event ? toLocalInput(event.end_at) : `${dayKey}T21:00`);
  const [dateStart, setDateStart] = useState(
    event ? taipeiDateKey(new Date(event.start_at)) : dayKey,
  );
  const [dateEnd, setDateEnd] = useState(
    event ? addDays(taipeiDateKey(new Date(event.end_at)), -1) : dayKey,
  );
  const [rrule, setRrule] = useState(event?.rrule ?? "");
  const [remind, setRemind] = useState<number | null>(event ? event.remind_minutes : 60);
  const [location, setLocation] = useState(event?.location ?? "");
  const [note, setNote] = useState(event?.note ?? "");
  const error = save.error ?? del.error;

  const owners: { k: OwnerKind; label: string; color: string }[] = [
    { k: "me", label: me?.display_name ?? "我", color: me?.color ?? "#60a5fa" },
    { k: "partner", label: partner?.display_name ?? "對方", color: partner?.color ?? "#f472b6" },
    { k: "shared", label: "共同 💕", color: SHARED_COLOR },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const times = allDay
      ? {
          start_at: `${dateStart}T00:00:00+08:00`,
          end_at: `${addDays(dateEnd < dateStart ? dateStart : dateEnd, 1)}T00:00:00+08:00`,
        }
      : { start_at: fromLocalInput(start), end_at: fromLocalInput(end < start ? start : end) };
    await save.mutateAsync({
      id: event?.id,
      body: {
        title: title.trim(),
        owner,
        all_day: allDay,
        ...times,
        rrule: rrule || null,
        remind_minutes: remind,
        location: location.trim() || null,
        note: note.trim() || null,
      },
    });
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        className="input text-lg"
        required
        maxLength={200}
        placeholder="行程名稱"
        autoFocus={!event}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="行程名稱"
      />
      <div className="flex gap-2">
        {owners.map((o) => (
          <button
            type="button"
            key={o.k}
            onClick={() => setOwner(o.k)}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm ring-2 transition",
              owner === o.k ? "font-semibold" : "opacity-60 ring-transparent",
            )}
            style={{
              background: o.color + "26",
              ...(owner === o.k ? { ["--tw-ring-color" as string]: o.color } : {}),
            }}
          >
            <span className="size-2.5 rounded-full" style={{ background: o.color }} />
            {o.label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between">
        <span>整天</span>
        <input
          type="checkbox"
          className="size-5 accent-brand-500"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
      </label>
      {allDay ? (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">開始</span>
            <input
              type="date"
              className="input"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </label>
          <label>
            <span className="label">結束</span>
            <input
              type="date"
              className="input"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <label>
            <span className="label">開始</span>
            <input
              type="datetime-local"
              className="input"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (e.target.value > end) setEnd(e.target.value);
              }}
            />
          </label>
          <label>
            <span className="label">結束</span>
            <input
              type="datetime-local"
              className="input"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">重複</span>
          <select className="input" value={rrule} onChange={(e) => setRrule(e.target.value)}>
            {REPEATS.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">提醒</span>
          <select
            className="input"
            value={remind ?? ""}
            onChange={(e) => setRemind(e.target.value === "" ? null : Number(e.target.value))}
          >
            {REMINDERS.map((r) => (
              <option key={String(r.v)} value={r.v ?? ""}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        className="input"
        placeholder="地點"
        maxLength={300}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        aria-label="地點"
      />
      <textarea
        className="input min-h-16"
        placeholder="備註"
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="備註"
      />
      {error && <p className="text-sm text-red-500">{error.message}</p>}
      <div className="flex gap-2">
        {event && (
          <button
            type="button"
            className="btn-ghost text-red-500"
            disabled={!online || del.isPending}
            onClick={async () => {
              if (confirm(`刪除「${event.title}」${event.rrule ? "（所有重複）" : ""}？`)) {
                await del.mutateAsync(event.id);
                onDone();
              }
            }}
          >
            刪除
          </button>
        )}
        <button className="btn-primary flex-1" disabled={!online || save.isPending}>
          {!online ? "離線中" : save.isPending ? "儲存中…" : event ? "儲存" : "新增行程"}
        </button>
      </div>
    </form>
  );
}
