import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Wish, WishCreate, WishUpdate } from "@/api/types";
import { api, unwrap } from "@/lib/api";

export type WishFilter = "all" | "open" | "done";

export const SUGGESTED_CATEGORIES = ["旅行", "美食", "在家", "約會", "學習", "買買買"];

export function useWishes() {
  // 一次抓全部，篩選在前端做：離線時切換篩選也有資料
  return useQuery({
    queryKey: ["wishes"],
    queryFn: () => unwrap(api.GET("/api/v1/wishes")),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wishes"] });
}

export function useCreateWish() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: WishCreate) => unwrap(api.POST("/api/v1/wishes", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateWish() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: WishUpdate }) =>
      unwrap(api.PATCH("/api/v1/wishes/{wish_id}", { params: { path: { wish_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteWish() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/wishes/{wish_id}", { params: { path: { wish_id: id } } })),
    onSuccess: invalidate,
  });
}

export function useCompleteWish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      done,
      photo_ids = [],
    }: {
      id: string;
      done: boolean;
      photo_ids?: string[];
    }) =>
      unwrap(
        api.POST("/api/v1/wishes/{wish_id}/complete", {
          params: { path: { wish_id: id } },
          body: { done, photo_ids },
        }),
      ),
    // 樂觀更新：勾選立刻有反應
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ["wishes"] });
      const prev = qc.getQueryData<Wish[]>(["wishes"]);
      qc.setQueryData<Wish[]>(["wishes"], (old) =>
        old?.map((w) =>
          w.id === id ? { ...w, done_at: done ? new Date().toISOString() : null } : w,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["wishes"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["wishes"] }),
  });
}

export function filterWishes(wishes: Wish[], filter: WishFilter, category: string | null): Wish[] {
  return wishes.filter(
    (w) =>
      (filter === "all" || (filter === "done" ? w.done_at !== null : w.done_at === null)) &&
      (category === null || w.category === category),
  );
}

export function categoriesOf(wishes: Wish[]): string[] {
  return [...new Set(wishes.map((w) => w.category).filter((c): c is string => !!c))].sort();
}
