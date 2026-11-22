import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EventIn, EventPatch, InvitationIn, Occurrence, User } from "@/api/types";
import { api, unwrap } from "@/lib/api";
import { addDays } from "@/lib/date";

export const SHARED_COLOR = "#a78bfa";

export function useEvents(fromKey: string, toKey: string) {
  return useQuery({
    queryKey: ["events", fromKey, toKey],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/events", {
          params: { query: { from: `${fromKey}T00:00:00+08:00`, to: `${toKey}T00:00:00+08:00` } },
        }),
      ),
  });
}

export function useTodayEvents(todayKey: string) {
  return useEvents(todayKey, addDays(todayKey, 1));
}

function useInv() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["invitations"] });
  };
}

export function useSaveEvent() {
  const inv = useInv();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: EventIn | EventPatch }) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/events/{event_id}", {
              params: { path: { event_id: id } },
              body: body as EventPatch,
            }),
          )
        : unwrap(api.POST("/api/v1/events", { body: body as EventIn })),
    onSuccess: inv,
  });
}

export function useDeleteEvent() {
  const inv = useInv();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/events/{event_id}", { params: { path: { event_id: id } } })),
    onSuccess: inv,
  });
}

export function useInvitations() {
  return useQuery({
    queryKey: ["invitations"],
    queryFn: () => unwrap(api.GET("/api/v1/invitations", { params: { query: { box: "all" } } })),
  });
}

export function useSendInvitation() {
  const inv = useInv();
  return useMutation({
    mutationFn: (body: InvitationIn) => unwrap(api.POST("/api/v1/invitations", { body })),
    onSuccess: inv,
  });
}

export function useRespond() {
  const inv = useInv();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      action: "accept" | "decline" | "counter";
      chosen_slot?: number;
      message?: string;
      counter_slots?: { start_at: string; end_at: string }[];
    }) =>
      unwrap(
        api.POST("/api/v1/invitations/{inv_id}/respond", {
          params: { path: { inv_id: id } },
          body,
        }),
      ),
    onSuccess: inv,
  });
}

export function useCancelInvitation() {
  const inv = useInv();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/invitations/{inv_id}/cancel", { params: { path: { inv_id: id } } })),
    onSuccess: inv,
  });
}

export function ownerColor(o: Occurrence, byId: Map<string, User>): string {
  return o.event.owner_id ? (byId.get(o.event.owner_id)?.color ?? "#94a3b8") : SHARED_COLOR;
}

export function ownerLabel(
  o: Occurrence,
  meId: string | undefined,
  byId: Map<string, User>,
): string {
  if (!o.event.owner_id) return "共同";
  if (o.event.owner_id === meId) return "我的";
  return byId.get(o.event.owner_id)?.display_name ?? "對方";
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "等待回覆",
  accepted: "已答應 💕",
  declined: "已婉拒",
  countered: "提議了其他時間",
  expired: "已過期",
};

export const THEMES: Record<string, { label: string; bg: string; accent: string; emoji: string }> =
  {
    rose: { label: "粉紅", bg: "from-rose-100 to-pink-200", accent: "#e11d48", emoji: "💌" },
    sky: { label: "天空", bg: "from-sky-100 to-indigo-200", accent: "#4f46e5", emoji: "✉️" },
    amber: { label: "暖陽", bg: "from-amber-100 to-orange-200", accent: "#d97706", emoji: "🌻" },
    mint: { label: "薄荷", bg: "from-emerald-100 to-teal-200", accent: "#059669", emoji: "🍃" },
  };
