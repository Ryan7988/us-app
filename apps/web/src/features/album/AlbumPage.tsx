import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { useAlbums, useCreateAlbum, usePhotos } from "./api";
import { PhotoGrid } from "./PhotoGrid";
import { UploadButton } from "./UploadButton";

export function AlbumPage() {
  const [tab, setTab] = useState<"photos" | "albums">("photos");
  const photos = usePhotos();
  const albums = useAlbums();
  const create = useCreateAlbum();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const all = photos.data?.pages.flatMap((p) => p.items) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({ title: title.trim() });
    setTitle("");
    setCreating(false);
  };

  return (
    <>
      <PageHeader
        title="相簿"
        action={
          <Link to="/more" className="text-sm text-brand-500">
            ‹ 更多
          </Link>
        }
      />
      <div className="mb-3 flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800">
        {(["photos", "albums"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 rounded-lg py-1.5 text-sm",
              tab === t ? "bg-white font-medium shadow-sm dark:bg-stone-600" : "text-stone-500",
            )}
          >
            {t === "photos" ? "所有照片" : "相簿"}
          </button>
        ))}
      </div>
      {tab === "photos" ? (
        <>
          <div className="mb-3">
            <UploadButton />
          </div>
          {photos.isLoading && <p className="text-center text-stone-400">載入中…</p>}
          {!photos.isLoading && all.length === 0 && (
            <p className="py-12 text-center text-stone-400">還沒有照片，上傳第一張吧 📷</p>
          )}
          <PhotoGrid
            photos={all}
            hasMore={!!photos.hasNextPage}
            loadMore={() => !photos.isFetchingNextPage && photos.fetchNextPage()}
          />
        </>
      ) : (
        <>
          <button className="btn-primary mb-3 w-full" onClick={() => setCreating(true)}>
            ＋ 新相簿
          </button>
          <div className="grid grid-cols-2 gap-3">
            {(albums.data ?? []).map((a) => (
              <Link
                key={a.id}
                to={`/more/album/${a.id}`}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-stone-800"
              >
                {a.cover_url ? (
                  <img src={a.cover_url} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-brand-50 text-4xl dark:bg-stone-700">
                    📔
                  </div>
                )}
                <div className="p-2.5">
                  <p className="truncate font-medium">{a.title}</p>
                  <p className="text-xs text-stone-400">{a.photo_count} 張</p>
                </div>
              </Link>
            ))}
          </div>
          {albums.data?.length === 0 && (
            <p className="py-10 text-center text-stone-400">用相簿把旅行、紀念日的照片分組</p>
          )}
        </>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title="新相簿">
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            required
            maxLength={100}
            placeholder="例如：2026 天准旅行"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            aria-label="相簿名稱"
          />
          <button className="btn-primary w-full" disabled={create.isPending}>
            建立
          </button>
        </form>
      </Sheet>
    </>
  );
}
