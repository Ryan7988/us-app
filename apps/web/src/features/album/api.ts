import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

export function usePhotos(filter: { album_id?: string; ref_type?: string; ref_id?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ["photos", filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/photos", {
          params: { query: { ...filter, cursor: pageParam, limit: 60 } },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function useAlbums() {
  return useQuery({ queryKey: ["albums"], queryFn: () => unwrap(api.GET("/api/v1/albums")) });
}

function useInv() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["albums"] });
    qc.invalidateQueries({ queryKey: ["photos"] });
  };
}

export function useCreateAlbum() {
  const inv = useInv();
  return useMutation({
    mutationFn: (body: { title: string; start_date?: string | null; end_date?: string | null }) =>
      unwrap(api.POST("/api/v1/albums", { body })),
    onSuccess: inv,
  });
}

export function useUpdateAlbum() {
  const inv = useInv();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; cover_photo_id?: string | null }) =>
      unwrap(api.PATCH("/api/v1/albums/{album_id}", { params: { path: { album_id: id } }, body })),
    onSuccess: inv,
  });
}

export function useDeleteAlbum() {
  const inv = useInv();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/albums/{album_id}", { params: { path: { album_id: id } } })),
    onSuccess: inv,
  });
}

export function useAddToAlbum() {
  const inv = useInv();
  return useMutation({
    mutationFn: ({ id, photo_ids }: { id: string; photo_ids: string[] }) =>
      unwrap(
        api.POST("/api/v1/albums/{album_id}/photos/add", {
          params: { path: { album_id: id } },
          body: { photo_ids },
        }),
      ),
    onSuccess: inv,
  });
}

export function useDeletePhoto() {
  const inv = useInv();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/photos/{photo_id}", { params: { path: { photo_id: id } } })),
    onSuccess: inv,
  });
}
