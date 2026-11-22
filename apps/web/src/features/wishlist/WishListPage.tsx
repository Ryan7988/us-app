import clsx from "clsx";
import { useState } from "react";
import type { Wish } from "@/api/types";
import { PlusIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { useUsers } from "@/lib/users";
import { categoriesOf, filterWishes, useCompleteWish, useWishes, type WishFilter } from "./api";
import { WishCard } from "./WishCard";
import { WishForm } from "./WishForm";

const FILTERS: { key: WishFilter; label: string }[] = [
  { key: "open", label: "未完成" },
  { key: "done", label: "已完成" },
  { key: "all", label: "全部" },
];

export function WishListPage() {
  const { data: wishes = [], isLoading, error } = useWishes();
  const { byId } = useUsers();
  const complete = useCompleteWish();
  const [filter, setFilter] = useState<WishFilter>("open");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Wish | "new" | null>(null);

  const categories = categoriesOf(wishes);
  const shown = filterWishes(wishes, filter, category);

  return (
    <>
      <PageHeader
        title="願望清單"
        action={
          <button
            className="btn-primary size-10 rounded-full p-0"
            aria-label="新增願望"
            onClick={() => setEditing("new")}
          >
            <PlusIcon />
          </button>
        }
      />

      <div className="mb-3 flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              "flex-1 rounded-lg py-1.5 text-sm transition",
              filter === f.key
                ? "bg-white font-medium shadow-sm dark:bg-stone-600"
                : "text-stone-500",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "_all"}
              onClick={() => setCategory(c)}
              className={clsx(
                "shrink-0 rounded-full px-3 py-1 text-sm",
                category === c
                  ? "bg-stone-800 text-white dark:bg-white dark:text-stone-900"
                  : "bg-white text-stone-600 ring-1 ring-black/5 dark:bg-stone-800 dark:text-stone-300",
              )}
            >
              {c ?? "全部分類"}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="py-10 text-center text-stone-400">載入中…</p>}
      {error && !wishes.length && <p className="py-10 text-center text-red-500">{error.message}</p>}
      {!isLoading && shown.length === 0 && (
        <div className="py-16 text-center text-stone-400">
          <div className="mb-2 text-4xl">{filter === "done" ? "🌱" : "✨"}</div>
          {filter === "done"
            ? "還沒有完成的願望，一起加油！"
            : "想一起做什麼？點右上角的 ＋ 記下來"}
        </div>
      )}

      <ul className="space-y-3">
        {shown.map((w) => (
          <WishCard
            key={w.id}
            wish={w}
            author={byId.get(w.created_by)}
            onToggle={() => complete.mutate({ id: w.id, done: w.done_at === null })}
            onEdit={() => setEditing(w)}
          />
        ))}
      </ul>
      {shown.length > 0 && filter === "open" && (
        <p className="mt-4 text-center text-xs text-stone-400">小技巧：卡片往左滑就能完成</p>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "新增願望" : "編輯願望"}
      >
        {editing !== null && (
          <WishForm
            key={editing === "new" ? "new" : editing.id}
            wish={editing === "new" ? null : editing}
            categories={categories}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}
