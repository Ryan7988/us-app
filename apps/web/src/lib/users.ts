import { useQuery } from "@tanstack/react-query";
import type { User } from "@/api/types";
import { api, unwrap } from "./api";
import { useAuth } from "./auth";

export function useUsers() {
  const me = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ["users"],
    queryFn: () => unwrap(api.GET("/api/v1/users")),
    staleTime: 10 * 60_000,
  });
  const users = q.data ?? [];
  const byId = new Map<string, User>(users.map((u) => [u.id, u]));
  const partner = users.find((u) => u.id !== me?.id) ?? null;
  return { users, byId, me, partner, isLoading: q.isLoading };
}
