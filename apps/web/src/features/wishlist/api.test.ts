import { describe, expect, it } from "vitest";
import type { Wish } from "@/api/types";
import { categoriesOf, filterWishes } from "./api";

const w = (id: string, done: boolean, category: string | null): Wish => ({
  id,
  title: id,
  note: null,
  url: null,
  category,
  cover_photo_id: null,
  created_by: "u1",
  created_at: "2026-11-23T00:00:00Z",
  updated_at: "2026-11-23T00:00:00Z",
  done_at: done ? "2026-11-24T00:00:00Z" : null,
  done_by: done ? "u2" : null,
});

const list = [
  w("a", false, "旅行"),
  w("b", true, "旅行"),
  w("c", false, "美食"),
  w("d", true, null),
];

describe("filterWishes", () => {
  it("依狀態篩選", () => {
    expect(filterWishes(list, "all", null).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterWishes(list, "open", null).map((x) => x.id)).toEqual(["a", "c"]);
    expect(filterWishes(list, "done", null).map((x) => x.id)).toEqual(["b", "d"]);
  });
  it("狀態 + 分類", () => {
    expect(filterWishes(list, "open", "旅行").map((x) => x.id)).toEqual(["a"]);
  });
  it("分類清單去重複並排序", () => {
    expect(categoriesOf(list)).toEqual(["旅行", "美食"].sort());
  });
});
