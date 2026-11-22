import { Link } from "react-router-dom";
import type { Rarity } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import { RARITY_STYLE, useHistory } from "./api";

const LABEL: Record<string, string> = {
  waiting: "等待開獎",
  drawn: "進行中",
  done: "完成 🏆",
  failed: "未完成",
  drawing: "開獎中",
};

export function HistoryPage() {
  const { data = [] } = useHistory();
  return (
    <>
      <PageHeader
        title="扭蛋歷史"
        action={
          <Link to="/gacha" className="text-sm text-brand-500">
            ‹ 扭蛋機
          </Link>
        }
      />
      {data.length === 0 && <p className="py-16 text-center text-stone-400">還沒有紀錄</p>}
      <ul className="space-y-3">
        {data.map((d) => (
          <li key={d.id} className="card flex gap-3">
            {d.proof_thumb_url ? (
              <img
                src={d.proof_thumb_url}
                alt=""
                className="size-16 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-2xl dark:bg-stone-700">
                🎰
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span>{d.period}</span>
                {d.rarity && (
                  <span
                    className="font-bold"
                    style={{ color: RARITY_STYLE[d.rarity as Rarity].color }}
                  >
                    {d.rarity}
                  </span>
                )}
                {d.pity_triggered && <span>保底</span>}
                <span className="ml-auto">{LABEL[d.status] ?? d.status}</span>
              </div>
              <p className="mt-1 font-medium">{d.card_content ?? "—"}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
