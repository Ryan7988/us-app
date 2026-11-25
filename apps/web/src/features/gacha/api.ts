import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GachaSettings, Rarity } from "@/api/types";
import { api, unwrap } from "@/lib/api";

export const RARITY_STYLE: Record<
  Rarity,
  { color: string; glow: string; label: string; bg: string }
> = {
  SSR: {
    color: "#f59e0b",
    glow: "rgba(251,191,36,0.9)",
    label: "SSR",
    bg: "from-amber-200 via-yellow-100 to-amber-300",
  },
  SR: {
    color: "#a855f7",
    glow: "rgba(168,85,247,0.8)",
    label: "SR",
    bg: "from-purple-200 via-fuchsia-100 to-purple-300",
  },
  R: {
    color: "#3b82f6",
    glow: "rgba(59,130,246,0.7)",
    label: "R",
    bg: "from-sky-200 via-blue-100 to-sky-300",
  },
};

export function useGachaCurrent() {
  return useQuery({
    queryKey: ["gacha", "current"],
    queryFn: () => unwrap(api.GET("/api/v1/gacha/current")),
  });
}

export function useCards(
  status: "active" | "pending_review" | "drawn" | "archived" | "all" = "all",
) {
  return useQuery({
    queryKey: ["gacha", "cards", status],
    queryFn: () =>
      unwrap(api.GET("/api/v1/gacha/cards", { params: { query: { status_filter: status } } })),
  });
}

export function useHistory() {
  return useQuery({
    queryKey: ["gacha", "history"],
    queryFn: () => unwrap(api.GET("/api/v1/gacha/history")),
  });
}

function useInv() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["gacha"] });
}

export function useReady() {
  const inv = useInv();
  return useMutation({
    mutationFn: (ready: boolean) =>
      unwrap(
        ready ? api.POST("/api/v1/gacha/current/ready") : api.POST("/api/v1/gacha/current/unready"),
      ),
    onSuccess: inv,
  });
}

export function useCompleteDraw() {
  const inv = useInv();
  return useMutation({
    mutationFn: (photo_id: string) =>
      unwrap(api.POST("/api/v1/gacha/current/complete", { body: { photo_id } })),
    onSuccess: inv,
  });
}

export function useCreateCard() {
  const inv = useInv();
  return useMutation({
    mutationFn: (body: { content: string; rarity: Rarity; repeatable: boolean }) =>
      unwrap(api.POST("/api/v1/gacha/cards", { body })),
    onSuccess: inv,
  });
}

export function useUpdateCard() {
  const inv = useInv();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      content?: string;
      rarity?: Rarity;
      status?: "active" | "archived";
      repeatable?: boolean;
    }) =>
      unwrap(
        api.PATCH("/api/v1/gacha/cards/{card_id}", { params: { path: { card_id: id } }, body }),
      ),
    onSuccess: inv,
  });
}

export function useReview() {
  const inv = useInv();
  return useMutation({
    mutationFn: ({
      id,
      approve,
      content,
      rarity,
    }: {
      id: string;
      approve: boolean;
      content?: string;
      rarity?: Rarity;
    }) =>
      approve
        ? unwrap(
            api.POST("/api/v1/gacha/cards/{card_id}/approve", {
              params: { path: { card_id: id } },
              body: { content, rarity },
            }),
          )
        : unwrap(
            api.POST("/api/v1/gacha/cards/{card_id}/reject", { params: { path: { card_id: id } } }),
          ),
    onSuccess: inv,
  });
}

export function useGachaSettings() {
  return useQuery({
    queryKey: ["gacha", "settings"],
    queryFn: () => unwrap(api.GET("/api/v1/gacha/settings")),
  });
}

export function useSaveGachaSettings() {
  const inv = useInv();
  return useMutation({
    mutationFn: (body: GachaSettings) => unwrap(api.PUT("/api/v1/gacha/settings", { body })),
    onSuccess: inv,
  });
}

export function useSimulate() {
  return useMutation({
    mutationFn: (n: number) =>
      unwrap(api.POST("/api/v1/gacha/simulate", { params: { query: { n } } })),
  });
}

/** 重抽後同一期會有新結果：用「期別 + 重抽次數」當作看過動畫的 key */
export function revealKey(d: { id: string; reroll_count?: number }): string {
  return `${d.id}:${d.reroll_count ?? 0}`;
}

export function useRequestReroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/api/v1/gacha/current/reroll/request", { body: { reason: reason || null } }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gacha"] }),
  });
}

export function useRespondReroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accept: boolean) =>
      unwrap(api.POST("/api/v1/gacha/current/reroll/respond", { body: { accept } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gacha"] }),
  });
}

export function useCancelReroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/gacha/current/reroll/cancel")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gacha"] }),
  });
}

const KEY = "gacha-revealed";
export function wasRevealed(drawId: string): boolean {
  try {
    return (localStorage.getItem(KEY) ?? "").split(",").includes(drawId);
  } catch {
    return false;
  }
}
export function markRevealed(drawId: string): void {
  try {
    localStorage.setItem(
      KEY,
      [...(localStorage.getItem(KEY) ?? "").split(",").slice(-20), drawId].join(","),
    );
  } catch {
    /* ignore */
  }
}
