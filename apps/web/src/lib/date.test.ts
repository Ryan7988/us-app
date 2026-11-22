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
