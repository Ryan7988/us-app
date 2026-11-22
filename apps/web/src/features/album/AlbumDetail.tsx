import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useAlbums, useDeleteAlbum, usePhotos, useUpdateAlbum } from "./api";
import { PhotoGrid } from "./PhotoGrid";
import { UploadButton } from "./UploadButton";

export function AlbumDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const album = useAlbums().data?.find((a) => a.id === id);
  const photos = usePhotos({ album_id: id });
  const del = useDeleteAlbum();
  const rename = useUpdateAlbum();
  const all = photos.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title={album?.title ?? "相簿"}
        action={
          <button className="text-sm text-brand-500" onClick={() => nav("/more/album")}>
            ‹ 相簿
          </button>
        }
      />
      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <UploadButton albumId={id} label="加照片到這本相簿" />
        </div>
      </div>
      <div className="mb-3 flex justify-end gap-4 text-xs text-stone-500">
        <button
          onClick={() => {
            const t = prompt("新名稱", album?.title);
            if (t?.trim()) rename.mutate({ id, title: t.trim() });
          }}
        >
          改名
        </button>
        <button
          className="text-red-500"
          onClick={async () => {
            if (confirm("刪除這本相簿？（照片不會被刪除）")) {
              await del.mutateAsync(id);
              nav("/more/album");
            }
          }}
        >
          刪除相簿
        </button>
      </div>
      {!photos.isLoading && all.length === 0 && (
        <p className="py-12 text-center text-stone-400">這本相簿還是空的</p>
      )}
      <PhotoGrid
        photos={all}
        albumId={id}
        hasMore={!!photos.hasNextPage}
        loadMore={() => !photos.isFetchingNextPage && photos.fetchNextPage()}
      />
    </>
  );
}
