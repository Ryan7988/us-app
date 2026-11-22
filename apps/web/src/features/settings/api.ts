import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

export function useAppSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => unwrap(api.GET("/api/v1/settings")) });
}
