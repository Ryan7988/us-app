import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Photo } from "@/api/types";
import { ApiError } from "./api";
import { refreshAccessToken, useAuth } from "./auth";

export interface UploadResult {
  photos: Photo[];
  duplicates: number;
  errors: string[];
}

/** multipart 上傳（openapi-fetch 對多檔上傳不方便，直接用 fetch）。 */
export async function uploadPhotos(files: File[], albumId?: string): Promise<UploadResult> {
  const send = async () => {
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    if (albumId) form.append("album_id", albumId);
    return fetch("/api/v1/photos", {
      method: "POST",
      body: form,
      headers: { Authorization: `Bearer ${useAuth.getState().accessToken}` },
    });
  };
  let res = await send();
  if (res.status === 401 && (await refreshAccessToken())) res = await send();
  if (!res.ok) throw new ApiError(res.status, `上傳失敗（${res.status}）`);
  return (await res.json()) as UploadResult;
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, albumId }: { files: File[]; albumId?: string }) => {
      // 一次最多 10 張，避免手機記憶體與逾時問題
      const all: UploadResult = { photos: [], duplicates: 0, errors: [] };
      for (let i = 0; i < files.length; i += 10) {
        const r = await uploadPhotos(files.slice(i, i + 10), albumId);
        all.photos.push(...r.photos);
        all.duplicates += r.duplicates;
        all.errors.push(...r.errors);
      }
      return all;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["albums"] });
    },
  });
}
