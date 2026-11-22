import createClient from "openapi-fetch";
import type { paths } from "@/api/schema";
import { refreshAccessToken, useAuth } from "./auth";

/** 自動帶 access token；遇到 401 先 refresh 再重送一次。 */
async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const token = useAuth.getState().accessToken;
  if (token) input.headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input);
  if (res.status !== 401 || input.url.includes("/auth/")) return res;

  if (!(await refreshAccessToken())) return res;
  retry.headers.set("Authorization", `Bearer ${useAuth.getState().accessToken}`);
  return fetch(retry);
}

export const api = createClient<paths>({ baseUrl: "", fetch: authFetch });

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 把 openapi-fetch 的 {data, error} 轉成 throw，方便配合 TanStack Query。 */
export async function unwrap<T>(
  p: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, errorMessage(error) ?? `請求失敗（${response.status}）`);
  }
  return data as T;
}

function errorMessage(err: unknown): string | undefined {
  if (err && typeof err === "object" && "detail" in err) {
    const d = (err as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return "欄位格式不正確";
  }
  return undefined;
}
