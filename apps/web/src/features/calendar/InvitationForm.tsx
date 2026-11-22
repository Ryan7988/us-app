import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { useOnline } from "@/lib/online";
import { THEMES, useSendInvitation } from "./api";
import { defaultSlot, type SlotDraft, slotsToApi } from "./slots";

export function SlotsEditor({
  slots,
  onChange,
}: {
  slots: SlotDraft[];
  onChange: (s: SlotDraft[]) => void;
}) {
  return (
    <div className="space-y-2">
      {slots.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="datetime-local"
            className="input min-w-0 flex-1"
            required
            value={s.start}
            aria-label={`候選時間 ${i + 1}`}
            onChange={(e) =>
              onChange(slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
            }
          />
          <select
            className="input w-24 shrink-0"
            value={s.hours}
            aria-label="長度"
            onChange={(e) =>
              onChange(slots.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))
            }
          >
            {[1, 2, 3, 4, 6, 8, 12].map((h) => (
              <option key={h} value={h}>
                {h} 小時
              </option>
            ))}
          </select>
          {slots.length > 1 && (
            <button
              type="button"
              className="text-stone-400"
              aria-label="移除"
              onClick={() => onChange(slots.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {slots.length < 3 && (
        <button
          type="button"
          className="text-sm text-brand-500"
          onClick={() =>
            onChange([
              ...slots,
              { start: slots[slots.length - 1].start, hours: slots[slots.length - 1].hours },
            ])
          }
        >
          ＋ 再加一個候選時間
        </button>
      )}
    </div>
  );
}

export function InvitationForm({ onDone }: { onDone: () => void }) {
  const send = useSendInvitation();
  const online = useOnline();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const [theme, setTheme] = useState("rose");
  const [slots, setSlots] = useState<SlotDraft[]>([defaultSlot()]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await send.mutateAsync({
      title: title.trim(),
      message: message.trim() || null,
      location: location.trim() || null,
      theme,
      proposed_slots: slotsToApi(slots),
    });
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={clsx("rounded-2xl bg-gradient-to-br p-4", THEMES[theme].bg)}>
        <input
          className="w-full bg-transparent text-xl font-bold text-stone-800 outline-none placeholder:text-stone-500"
          required
          maxLength={200}
          placeholder="要一起吃晚餐嗎？"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="邀請標題"
        />
        <textarea
          className="mt-2 min-h-20 w-full resize-none bg-transparent text-stone-700 outline-none placeholder:text-stone-500"
          maxLength={2000}
          placeholder="想對她說的話…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="內文"
        />
      </div>
      <div className="flex gap-2">
        {Object.entries(THEMES).map(([k, t]) => (
          <button
            type="button"
            key={k}
            onClick={() => setTheme(k)}
            className={clsx(
              "flex-1 rounded-xl bg-gradient-to-br py-2 text-sm",
              t.bg,
              theme === k ? "ring-2 ring-stone-700" : "opacity-70",
            )}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <div>
        <span className="label">候選時間（最多 3 個，讓對方選）</span>
        <SlotsEditor slots={slots} onChange={setSlots} />
      </div>
      <input
        className="input"
        placeholder="地點"
        maxLength={300}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        aria-label="地點"
      />
      {send.error && <p className="text-sm text-red-500">{send.error.message}</p>}
      <button className="btn-primary w-full" disabled={!online || send.isPending}>
        {send.isPending ? "寄送中…" : "寄出邀請函 💌"}
      </button>
    </form>
  );
}
