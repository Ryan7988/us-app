import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/api/types";
import { PhotoViewer } from "./PhotoViewer";

/** 縮圖格狀列表（只載入縮圖），捲到底自動載入下一頁 */
export function PhotoGrid({
  photos,
  hasMore,
  loadMore,
  albumId,
}: {
  photos: Photo[];
  hasMore: boolean;
  loadMore: () => void;
  albumId?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return (
    <>
      <div className="-mx-4 grid grid-cols-3 gap-0.5">
        {photos.map((p, i) => (
          <button
            key={p.id}
            className="aspect-square overflow-hidden bg-stone-200 dark:bg-stone-800"
            onClick={() => setOpen(i)}
          >
            <img src={p.thumb_url} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
      <div ref={sentinel} className="h-8" />
      {open !== null && photos[open] && (
        <PhotoViewer
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          albumId={albumId}
        />
      )}
    </>
  );
}
