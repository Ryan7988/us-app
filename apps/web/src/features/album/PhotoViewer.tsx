import { useEffect, useRef } from "react";
import type { Photo } from "@/api/types";
import { formatDateTime } from "@/lib/date";
import { useUsers } from "@/lib/users";
import { useDeletePhoto, useUpdateAlbum } from "./api";

export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  albumId,
}: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  albumId?: string;
}) {
  const p = photos[index];
  const { byId } = useUsers();
  const del = useDeletePhoto();
  const setCover = useUpdateAlbum();
  const startX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex, onClose]);

  return (
    <div
      className="pt-safe pb-safe fixed inset-0 z-[55] flex flex-col bg-black text-white"
      role="dialog"
      aria-label="照片"
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        if (dx < -60 && index < photos.length - 1) onIndex(index + 1);
        if (dx > 60 && index > 0) onIndex(index - 1);
        startX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <button onClick={onClose} aria-label="關閉" className="text-2xl leading-none">
          ✕
        </button>
        <span className="text-white/70">
          {index + 1} / {photos.length}
        </span>
        <a href={p.original_url} download className="text-white/80">
          原圖
        </a>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <img
          key={p.id}
          src={p.display_url}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
        {index > 0 && (
          <button
            className="absolute left-0 h-full w-1/5"
            aria-label="上一張"
            onClick={() => onIndex(index - 1)}
          />
        )}
        {index < photos.length - 1 && (
          <button
            className="absolute right-0 h-full w-1/5"
            aria-label="下一張"
            onClick={() => onIndex(index + 1)}
          />
        )}
      </div>
      <div className="flex items-center gap-3 px-4 py-3 text-xs text-white/70">
        <span className="flex-1">
          {formatDateTime(p.taken_at)}・{byId.get(p.uploader_id)?.display_name}
        </span>
        {albumId && (
          <button onClick={() => setCover.mutate({ id: albumId, cover_photo_id: p.id })}>
            {setCover.isSuccess ? "已設為封面" : "設為封面"}
          </button>
        )}
        <button
          className="text-red-400"
          onClick={async () => {
            if (!confirm("刪除這張照片？")) return;
            await del.mutateAsync(p.id);
            if (photos.length <= 1) onClose();
            else onIndex(Math.min(index, photos.length - 2));
          }}
        >
          刪除
        </button>
      </div>
    </div>
  );
}
