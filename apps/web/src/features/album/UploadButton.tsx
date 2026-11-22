import { useRef, useState } from "react";
import { useOnline } from "@/lib/online";
import { useUpload } from "@/lib/upload";

export function UploadButton({
  albumId,
  label = "上傳照片",
}: {
  albumId?: string;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const upload = useUpload();
  const online = useOnline();
  const [msg, setMsg] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg(`上傳 ${files.length} 張中…`);
    try {
      const r = await upload.mutateAsync({ files: Array.from(files), albumId });
      const ok = r.photos.length - r.duplicates;
      setMsg(
        [
          `✓ ${ok} 張`,
          r.duplicates && `${r.duplicates} 張重複`,
          r.errors.length && `${r.errors.length} 張失敗：${r.errors.join("、")}`,
        ]
          .filter(Boolean)
          .join("，"),
      );
    } catch (e) {
      setMsg((e as Error).message);
    }
    if (ref.current) ref.current.value = "";
  };

  return (
    <div>
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
        data-testid="photo-input"
      />
      <button
        className="btn-primary w-full"
        disabled={!online || upload.isPending}
        onClick={() => ref.current?.click()}
      >
        {upload.isPending ? "上傳中…" : `📷 ${label}`}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-stone-500">{msg}</p>}
    </div>
  );
}
