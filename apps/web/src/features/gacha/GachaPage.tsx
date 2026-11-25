import clsx from "clsx";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { DrawOut, Rarity } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import { useOnline } from "@/lib/online";
import { useUpload } from "@/lib/upload";
import { useUsers } from "@/lib/users";
import { onRealtime } from "@/lib/ws";
import {
  markRevealed,
  revealKey,
  RARITY_STYLE,
  useCompleteDraw,
  useGachaCurrent,
  useReady,
  wasRevealed,
} from "./api";
import { GachaMachine } from "./GachaMachine";
import { GachaReveal } from "./GachaReveal";
import { RerollPanel } from "./RerollPanel";

export function GachaPage() {
  const { data, isLoading, error, refetch } = useGachaCurrent();
  const { users, me } = useUsers();
  const ready = useReady();
  const complete = useCompleteDraw();
  const upload = useUpload();
  const online = useOnline();
  const [reveal, setReveal] = useState<DrawOut | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 對方按下準備、兩人都準備好 → 兩支手機同時收到 gacha.drawn，同步播放動畫
  useEffect(
    () =>
      onRealtime(async (type, payload) => {
        if (type === "gacha.drawn" && payload.rarity) {
          const r = await refetch();
          const d = r.data?.draw;
          if (d?.status === "drawn" && !wasRevealed(revealKey(d))) setReveal(d);
        }
      }),
    [refetch],
  );

  if (isLoading) return <p className="py-20 text-center text-stone-400">載入中…</p>;
  if (error || !data)
    return <p className="py-20 text-center text-red-500">{error?.message ?? "載入失敗"}</p>;
  const d = data.draw;
  const iAmReady = !!me && d.ready_users.includes(me.id);
  const poolTotal = Object.values(data.pool_counts).reduce((a, b) => a + b, 0);
  const toPity = Math.max(0, data.pity_threshold - data.misses_since_ssr);
  const [y, m] = d.period.split("-");

  const pressReady = async () => {
    const r = await ready.mutateAsync(!iAmReady);
    if (r.status === "drawn" && !wasRevealed(revealKey(r))) setReveal(r);
  };

  const onProof = async (files: FileList | null) => {
    if (!files?.length) return;
    const res = await upload.mutateAsync({ files: [files[0]] });
    if (res.photos[0]) await complete.mutateAsync(res.photos[0].id);
  };

  return (
    <>
      <PageHeader
        title="扭蛋機"
        action={
          <span className="text-sm text-stone-500">
            {y} 年 {Number(m)} 月
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="連續達成" value={`🔥 ${data.streak}`} />
        <Stat label="卡池" value={`${poolTotal} 張`} />
        <Stat label="保底" value={toPity <= 1 ? "下次必中!" : `再 ${toPity} 次`} />
      </div>

      {(d.status === "waiting" || d.status === "drawing") && (
        <div className="card flex flex-col items-center py-6">
          <GachaMachine size={180} shaking={ready.isPending} />
          <p className="mt-2 font-semibold">兩個人都按下「準備好了」就開獎</p>
          <div className="mt-4 flex gap-6">
            {users.map((u) => {
              const ok = d.ready_users.includes(u.id);
              return (
                <div key={u.id} className="flex flex-col items-center gap-1">
                  <div
                    className={clsx(
                      "flex size-14 items-center justify-center rounded-full text-xl font-bold text-white transition",
                      ok ? "scale-110 ring-4 ring-emerald-400" : "opacity-50 grayscale",
                    )}
                    style={{ background: u.color }}
                  >
                    {u.display_name.slice(0, 1)}
                  </div>
                  <span className="text-xs">{ok ? "準備好了 ✓" : "還沒"}</span>
                </div>
              );
            })}
          </div>
          {poolTotal === 0 ? (
            <Link to="/gacha/pool" className="btn-primary mt-5 w-full">
              卡池是空的，先去新增卡片
            </Link>
          ) : (
            <button
              className={clsx(
                "mt-5 w-full py-3 text-lg",
                iAmReady ? "btn-ghost ring-1 ring-black/10" : "btn-primary",
              )}
              disabled={!online || ready.isPending}
              onClick={pressReady}
            >
              {ready.isPending ? "…" : iAmReady ? "取消準備" : "準備好了！"}
            </button>
          )}
          {ready.error && <p className="mt-2 text-sm text-red-500">{ready.error.message}</p>}
        </div>
      )}

      {(d.status === "drawn" || d.status === "done" || d.status === "failed") && d.rarity && (
        <div
          className={clsx(
            "rounded-3xl bg-gradient-to-br p-6 text-center text-stone-800 shadow-lg",
            RARITY_STYLE[d.rarity as Rarity].bg,
          )}
        >
          <p
            className="text-3xl font-black"
            style={{ color: RARITY_STYLE[d.rarity as Rarity].color }}
          >
            {d.rarity}
          </p>
          {d.pity_triggered && <p className="text-xs font-semibold text-amber-700">保底</p>}
          <p className="mt-3 text-xl font-bold">{d.card_content}</p>
          {d.status === "drawn" && !wasRevealed(revealKey(d)) && (
            <button className="btn-ghost mt-3 bg-white/60" onClick={() => setReveal(d)}>
              🎁 開蛋動畫
            </button>
          )}
          {d.status === "drawn" && (
            <>
              <p className="mt-4 text-sm">完成後上傳一張照片當作證明（會自動放進相簿）</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => onProof(e.target.files)}
              />
              <button
                className="btn-primary mt-3 w-full"
                disabled={!online || upload.isPending || complete.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {upload.isPending || complete.isPending ? "上傳中…" : "📷 上傳證明，完成任務"}
              </button>
              {(upload.error || complete.error) && (
                <p className="mt-2 text-sm text-red-600">
                  {(upload.error ?? complete.error)?.message}
                </p>
              )}
            </>
          )}
          {d.status === "done" && (
            <div className="mt-4">
              {d.proof_thumb_url && (
                <img
                  src={d.proof_thumb_url}
                  alt="證明照片"
                  className="mx-auto max-h-60 rounded-2xl"
                />
              )}
              <p className="mt-2 font-semibold">🏆 任務完成！</p>
            </div>
          )}
          {d.status === "failed" && <p className="mt-4 font-semibold">這個月沒有完成 😢</p>}
        </div>
      )}

      {d.status === "drawn" && (
        <RerollPanel draw={d} onRerolled={(nd) => !wasRevealed(revealKey(nd)) && setReveal(nd)} />
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link to="/gacha/pool" className="card text-center text-sm">
          🃏
          <br />
          卡池
        </Link>
        <Link to="/gacha/review" className="card relative text-center text-sm">
          🤖
          <br />
          AI 審核
          {data.pending_review > 0 && (
            <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {data.pending_review}
            </span>
          )}
        </Link>
        <Link to="/gacha/history" className="card text-center text-sm">
          📜
          <br />
          歷史
        </Link>
      </div>

      <AnimatePresence>
        {reveal?.rarity && (
          <GachaReveal
            rarity={reveal.rarity as Rarity}
            content={reveal.card_content ?? ""}
            pity={reveal.pity_triggered}
            onClose={() => {
              markRevealed(revealKey(reveal));
              setReveal(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-2 py-3">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  );
}
