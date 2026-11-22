import { useState } from "react";
import { Link } from "react-router-dom";
import type { Card, Rarity } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import { useOnline } from "@/lib/online";
import { RARITY_STYLE, useCards, useReview } from "./api";

/** AI 出的卡預設待審核，任一人通過才進卡池（可改文字與稀有度）。 */
export function ReviewPage() {
  const { data = [], isLoading } = useCards("pending_review");
  return (
    <>
      <PageHeader
        title="AI 卡片審核"
        action={
          <Link to="/gacha" className="text-sm text-brand-500">
            ‹ 扭蛋機
          </Link>
        }
      />
      {isLoading && <p className="text-center text-stone-400">載入中…</p>}
      {!isLoading && data.length === 0 && (
        <p className="py-16 text-center text-stone-400">
          沒有待審核的卡片 🎉
          <br />
          <span className="text-xs">AI 每月 20 號會自動補卡，也可以在後台手動產生</span>
        </p>
      )}
      <ul className="space-y-3">
        {data.map((c) => (
          <ReviewItem key={c.id} card={c} />
        ))}
      </ul>
    </>
  );
}

function ReviewItem({ card }: { card: Card }) {
  const review = useReview();
  const online = useOnline();
  const [content, setContent] = useState(card.content);
  const [rarity, setRarity] = useState<Rarity>(card.rarity as Rarity);
  return (
    <li className="card space-y-2">
      <textarea
        className="input min-h-14 text-sm"
        value={content}
        maxLength={300}
        onChange={(e) => setContent(e.target.value)}
        aria-label="卡片內容"
      />
      {card.reason && <p className="text-xs text-stone-500">AI：{card.reason}</p>}
      <div className="flex items-center gap-2">
        {(["SSR", "SR", "R"] as Rarity[]).map((r) => (
          <button
            key={r}
            onClick={() => setRarity(r)}
            className="rounded-lg px-2.5 py-1 text-xs font-bold"
            style={{
              color: rarity === r ? "#fff" : RARITY_STYLE[r].color,
              background: rarity === r ? RARITY_STYLE[r].color : RARITY_STYLE[r].color + "1f",
            }}
          >
            {r}
          </button>
        ))}
        <span className="flex-1" />
        <button
          className="btn-ghost px-3 py-1.5 text-sm text-stone-500"
          disabled={!online || review.isPending}
          onClick={() => review.mutate({ id: card.id, approve: false })}
        >
          不要
        </button>
        <button
          className="btn-primary px-3 py-1.5 text-sm"
          disabled={!online || review.isPending}
          onClick={() =>
            review.mutate({ id: card.id, approve: true, content: content.trim(), rarity })
          }
        >
          通過
        </button>
      </div>
    </li>
  );
}
