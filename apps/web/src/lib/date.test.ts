import { describe, expect, it } from "vitest";
import { daysTogether, greeting, taipeiDateKey, timeAgo } from "./date";

describe("date utils", () => {
  it("taipeiDateKey 跨日邊界：UTC 16:00 = 台灣隔天 00:00", () => {
    expect(taipeiDateKey(new Date("2026-11-30T15:59:59Z"))).toBe("2026-11-30");
    expect(taipeiDateKey(new Date("2026-11-30T16:00:00Z"))).toBe("2026-12-01");
  });

  it("daysTogether 當天算第 1 天", () => {
    expect(daysTogether("2026-11-23", new Date("2026-11-23T01:00:00Z"))).toBe(1);
    expect(daysTogether("2025-11-23", new Date("2026-11-23T01:00:00Z"))).toBe(366);
  });

  it("timeAgo", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(timeAgo("2026-11-23T11:59:30Z", now)).toBe("剛剛");
    expect(timeAgo("2026-11-23T11:55:00Z", now)).toBe("5 分鐘前");
    expect(timeAgo("2026-11-23T09:00:00Z", now)).toBe("3 小時前");
    expect(timeAgo("2026-11-22T11:00:00Z", now)).toBe("昨天");
  });

  it("greeting 用台北時間", () => {
    expect(greeting(new Date("2026-11-23T00:00:00Z"))).toBe("早安"); // 台北 08:00
    expect(greeting(new Date("2026-11-23T12:00:00Z"))).toBe("晚安"); // 台北 20:00
  });
});

import { addDays, fromLocalInput, monthGrid, toLocalInput } from "./date";

describe("calendar helpers", () => {
  it("monthGrid 從週日開始、42 格", () => {
    const g = monthGrid(2026, 12); // 2026-12-01 是週二
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-11-29");
    expect(g[2]).toBe("2026-12-01");
    expect(monthGrid(2026, 11)[0]).toBe("2026-11-01"); // 11/1 是週日
  });
  it("addDays 跨月", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("datetime-local 與 ISO 互轉（台北時間）", () => {
    expect(fromLocalInput("2026-12-05T19:00")).toBe("2026-12-05T11:00:00.000Z");
    expect(toLocalInput("2026-12-05T11:00:00Z")).toBe("2026-12-05T19:00");
  });
});
