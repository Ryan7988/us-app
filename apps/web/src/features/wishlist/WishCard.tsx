import clsx from "clsx";
import { useRef, useState, type PointerEvent } from "react";
import type { User, Wish } from "@/api/types";
import { CheckIcon, LinkIcon } from "@/components/icons";
import { timeAgo } from "@/lib/date";

const SWIPE_TRIGGER = 80;

/** 卡片式願望；左滑完成 / 取消完成，點一下編輯。 */
export function WishCard({
  wish,
  author,
  onToggle,
  onEdit,
}: {
  wish: Wish;
  author: User | undefined;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const done = wish.done_at !== null;

  const onDown = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    swiping.current = false;
  };
  const onMove = (e: PointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (!swiping.current && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my))
      swiping.current = true;
    if (swiping.current) setDx(Math.max(-120, Math.min(0, mx)));
  };
  const onUp = () => {
    if (swiping.current && dx <= -SWIPE_TRIGGER) onToggle();
    start.current = null;
    setDx(0);
  };

  return (
    <li className="relative overflow-hidden rounded-2xl">
      <div
        className={clsx(
          "absolute inset-0 flex items-center justify-end pr-6 text-white",
          done ? "bg-stone-400" : "bg-emerald-500",
        )}
      >
        <span className="text-sm font-medium">{done ? "取消完成" : "完成 🎉"}</span>
      </div>
      <div
        className={clsx(
          "card relative flex touch-pan-y items-start gap-3 select-none",
          dx === 0 && "transition-transform",
        )}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => !swiping.current && onEdit()}
      >
        <button
          aria-label={done ? "取消完成" : "標記完成"}
          className={clsx(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-stone-300 dark:border-stone-500",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {done && <CheckIcon className="size-4" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={clsx("font-medium", done && "text-stone-400 line-through")}>{wish.title}</p>
          {wish.note && <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{wish.note}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-400">
            {wish.category && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                {wish.category}
              </span>
            )}
            {author && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: author.color }} />
                {author.display_name}
              </span>
            )}
            <span>{timeAgo(wish.created_at)}</span>
            {wish.url && (
              <a
                href={wish.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-0.5 text-sky-500"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkIcon className="size-3.5" />
                連結
              </a>
            )}
          </div>
        </div>
        {wish.cover_thumb_url && (
          <img
            src={wish.cover_thumb_url}
            alt=""
            className="size-14 shrink-0 rounded-xl object-cover"
          />
        )}
      </div>
    </li>
  );
}
