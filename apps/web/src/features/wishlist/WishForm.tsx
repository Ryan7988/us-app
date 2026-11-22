import { useRef, useState, type FormEvent } from "react";
import type { Wish } from "@/api/types";
import { useOnline } from "@/lib/online";
import { useUpload } from "@/lib/upload";
import {
  SUGGESTED_CATEGORIES,
  useCompleteWish,
  useCreateWish,
  useDeleteWish,
  useUpdateWish,
} from "./api";

export function WishForm({
  wish,
  categories,
  onDone,
}: {
  wish: Wish | null;
  categories: string[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState(wish?.title ?? "");
  const [note, setNote] = useState(wish?.note ?? "");
  const [url, setUrl] = useState(wish?.url ?? "");
  const [category, setCategory] = useState(wish?.category ?? "");
  const create = useCreateWish();
  const update = useUpdateWish();
  const del = useDeleteWish();
  const online = useOnline();
  const complete = useCompleteWish();
  const upload = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || del.isPending;
  const error = create.error ?? update.error ?? del.error;

  const allCategories = [...new Set([...SUGGESTED_CATEGORIES, ...categories])];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      title: title.trim(),
      note: note.trim() || null,
      url: url.trim() || null,
      category: category.trim() || null,
    };
    if (wish) await update.mutateAsync({ id: wish.id, body });
    else await create.mutateAsync(body);
    onDone();
  };

  /** 完成並附照片：照片自動進相簿，並關聯到這個願望 */
  const onPhotos = async (files: FileList | null) => {
    if (!wish || !files?.length) return;
    setPhotoMsg("上傳中…");
    try {
      const r = await upload.mutateAsync({ files: Array.from(files) });
      await complete.mutateAsync({ id: wish.id, done: true, photo_ids: r.photos.map((p) => p.id) });
      setPhotoMsg(`✓ 已附上 ${r.photos.length} 張照片，也放進相簿了`);
    } catch (e) {
      setPhotoMsg((e as Error).message);
    }
  };

  const remove = async () => {
    if (!wish || !confirm(`確定要刪除「${wish.title}」嗎？`)) return;
    await del.mutateAsync(wish.id);
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="w-title">
          想一起做什麼？
        </label>
        <input
          id="w-title"
          className="input"
          required
          maxLength={200}
          autoFocus={!wish}
          placeholder="例如：去合歡山看星星"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <span className="label">分類</span>
        <div className="flex flex-wrap gap-2">
          {allCategories.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(category === c ? "" : c)}
              className={`rounded-full px-3 py-1 text-sm transition ${
                category === c
                  ? "bg-brand-500 text-white"
                  : "bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="w-note">
          備註
        </label>
        <textarea
          id="w-note"
          className="input min-h-20"
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="w-url">
          連結
        </label>
        <input
          id="w-url"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      {wish && (
        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => onPhotos(e.target.files)}
          />
          <button
            type="button"
            className="w-full text-sm font-medium text-emerald-700 dark:text-emerald-300"
            disabled={!online || upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {wish.done_at ? "📷 再加幾張回憶照片" : "🎉 完成了！附上照片"}
          </button>
          {photoMsg && <p className="mt-1 text-center text-xs text-stone-500">{photoMsg}</p>}
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error.message}</p>}
      <div className="flex gap-2">
        {wish && (
          <button
            type="button"
            className="btn-ghost text-red-500"
            onClick={remove}
            disabled={busy || !online}
          >
            刪除
          </button>
        )}
        <button className="btn-primary flex-1" disabled={busy || !online}>
          {!online ? "離線中" : busy ? "儲存中…" : wish ? "儲存" : "新增"}
        </button>
      </div>
    </form>
  );
}
