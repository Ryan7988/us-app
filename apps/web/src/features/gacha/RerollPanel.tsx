import { useState } from "react";
import type { DrawOut } from "@/api/types";
import { Sheet } from "@/components/Sheet";
import { useOnline } from "@/lib/online";
import { useUsers } from "@/lib/users";
import { useCancelReroll, useRequestReroll, useRespondReroll } from "./api";

/** 重抽：一方提議、另一方同意才會重抽（兩支手機同步再開一次獎）。 */
export function RerollPanel({
  draw,
  onRerolled,
}: {
  draw: DrawOut;
  onRerolled: (d: DrawOut) => void;
}) {
  const { me, byId } = useUsers();
  const online = useOnline();
  const request = useRequestReroll();
  const respond = useRespondReroll();
  const cancel = useCancelReroll();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const requester = draw.reroll_requested_by ? byId.get(draw.reroll_requested_by) : null;
  const mine = draw.reroll_requested_by === me?.id;
  const error = request.error ?? respond.error ?? cancel.error;

  // 對方提議了 → 大大的同意 / 不同意
  if (requester && !mine) {
    return (
      <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-700">
        <p className="font-semibold">🔄 {requester.display_name} 想重抽這張卡</p>
        {draw.reroll_reason && <p className="mt-1 text-sm">「{draw.reroll_reason}」</p>}
        <p className="mt-1 text-xs opacity-80">
          同意的話會立刻重抽，這張卡會放回卡池；這個月還能重抽 {draw.rerolls_left} 次。
        </p>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-ghost flex-1 bg-white/70 dark:bg-white/10"
            disabled={!online || respond.isPending}
            onClick={() => respond.mutate(false)}
          >
            維持這張 💪
          </button>
          <button
            className="btn-primary flex-1"
            disabled={!online || respond.isPending}
            onClick={async () => onRerolled(await respond.mutateAsync(true))}
          >
            {respond.isPending ? "重抽中…" : "同意重抽"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error.message}</p>}
      </div>
    );
  }

  // 我提議了 → 等對方
  if (mine) {
    const partner = [...byId.values()].find((u) => u.id !== me?.id);
    return (
      <div className="mt-4 rounded-2xl bg-white/70 p-4 text-center text-sm ring-1 ring-black/5 dark:bg-stone-800">
        <p>已提議重抽，等 {partner?.display_name ?? "對方"} 同意中…</p>
        <button
          className="mt-2 text-xs text-stone-500"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          收回提議
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error.message}</p>}
      </div>
    );
  }

  if (draw.rerolls_left <= 0) {
    return (
      <p className="mt-3 text-center text-xs text-stone-400">這個月的重抽次數用完了，一起加油 💪</p>
    );
  }

  return (
    <>
      <button
        className="mt-3 w-full text-center text-sm text-stone-500 underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        這個月真的做不到？提議重抽（剩 {draw.rerolls_left} 次）
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="提議重抽">
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            要兩個人都同意才會重抽。對方會收到通知，按「同意」後立刻重抽，這張卡會放回卡池，下次還可能抽到。
          </p>
          <input
            className="input"
            maxLength={200}
            placeholder="理由（例如：月底才開始，來不及準備）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="重抽理由"
          />
          {request.error && <p className="text-sm text-red-500">{request.error.message}</p>}
          <button
            className="btn-primary w-full"
            disabled={!online || request.isPending}
            onClick={async () => {
              await request.mutateAsync(reason.trim());
              setOpen(false);
              setReason("");
            }}
          >
            送出提議
          </button>
        </div>
      </Sheet>
    </>
  );
}
