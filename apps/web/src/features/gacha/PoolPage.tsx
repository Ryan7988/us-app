import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Rarity } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import { useOnline } from "@/lib/online";
import { RARITY_STYLE, useCards, useCreateCard, useUpdateCard } from "./api";

const RARITIES: Rarity[] = ["SSR", "SR", "R"];
const HINT: Record<Rarity, string> = {
  SSR: "需要提前規劃的大事",
  SR: "要安排半天或需要預算",
  R: "日常、免費或低成本",
};

export function PoolPage() {
  const { data = [] } = useCards("all");
  const create = useCreateCard();
  const update = useUpdateCard();
  const online = useOnline();
  const [content, setContent] = useState("");
  const [rarity, setRarity] = useState<Rarity>("R");
  const [repeatable, setRepeatable] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({ content: content.trim(), rarity, repeatable });
    setContent("");
  };
  const visible = data.filter((c) =>
    showAll ? c.status !== "pending_review" : c.status === "active",
  );

  return (
    <>
      <PageHeader
        title="卡池"
        action={
          <Link to="/gacha" className="text-sm text-brand-500">
            ‹ 扭蛋機
          </Link>
        }
      />
      <form onSubmit={submit} className="card mb-4 space-y-3">
        <textarea
          className="input min-h-16"
          required
          maxLength={300}
          placeholder="寫一張任務卡，例如：一起去看日出"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label="卡片內容"
        />
        <div className="flex gap-2">
          {RARITIES.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRarity(r)}
              className={clsx(
                "flex-1 rounded-xl py-2 text-sm font-bold ring-2",
                rarity === r ? "" : "opacity-50 ring-transparent",
              )}
              style={{
                color: RARITY_STYLE[r].color,
                background: RARITY_STYLE[r].color + "1f",
                ...(rarity === r ? { ["--tw-ring-color" as string]: RARITY_STYLE[r].color } : {}),
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          {rarity}：{HINT[rarity]}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand-500"
            checked={repeatable}
            onChange={(e) => setRepeatable(e.target.checked)}
          />
          可以重複抽到
        </label>
        <button className="btn-primary w-full" disabled={!online || create.isPending}>
          加入卡池
        </button>
      </form>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">
          {showAll ? "所有卡片" : "在卡池裡"}（{visible.length}）
        </h2>
        <button className="text-sm text-brand-500" onClick={() => setShowAll(!showAll)}>
          {showAll ? "只看卡池" : "含已抽過 / 封存"}
        </button>
      </div>
      {RARITIES.map((r) => {
        const cards = visible.filter((c) => c.rarity === r);
        if (!cards.length) return null;
        return (
          <section key={r} className="mb-4">
            <p className="mb-1 text-sm font-bold" style={{ color: RARITY_STYLE[r].color }}>
              {r}（{cards.length}）
            </p>
            <ul className="space-y-2">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className={clsx(
                    "card flex items-center gap-3 py-3",
                    c.status !== "active" && "opacity-50",
                  )}
                >
                  <span className="flex-1 text-sm">
                    {c.content}
                    <span className="ml-1 text-xs text-stone-400">
                      {c.source === "ai" && "🤖"}
                      {c.repeatable && "🔁"}
                      {c.status === "drawn" && "（已抽過）"}
                      {c.status === "archived" && "（封存）"}
                    </span>
                  </span>
                  <button
                    className="text-xs text-stone-400"
                    disabled={!online}
                    onClick={() =>
                      update.mutate({
                        id: c.id,
                        status: c.status === "active" ? "archived" : "active",
                      })
                    }
                  >
                    {c.status === "active" ? "封存" : "放回"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
