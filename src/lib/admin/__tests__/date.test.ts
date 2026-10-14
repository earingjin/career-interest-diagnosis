import { describe, expect, it } from "vitest";
import { AdminListInputError, formatSeoulTime, seoulDayRange, seoulToday } from "../date";

describe("한국 날짜", () => {
  it("한국 자정에 날짜가 바뀐다", () => {
    expect(seoulToday(new Date("2026-10-13T14:59:59.999Z"))).toBe("2026-10-13");
    expect(seoulToday(new Date("2026-10-13T15:00:00Z"))).toBe("2026-10-14");
    expect(seoulDayRange("2026-10-14")).toEqual({ start: "2026-10-13T15:00:00.000Z", end: "2026-10-14T15:00:00.000Z" });
    expect(formatSeoulTime("2026-10-13T15:00:00Z")).toBe("00:00:00");
  });
  it.each([
    ["2026-04-30", "2026-04-30T15:00:00.000Z"],
    ["2026-12-31", "2026-12-31T15:00:00.000Z"],
    ["2024-02-28", "2024-02-28T15:00:00.000Z"],
    ["2024-02-29", "2024-02-29T15:00:00.000Z"],
    ["2026-02-28", "2026-02-28T15:00:00.000Z"],
  ])("월말·연말·윤일 %s", (date, end) => {
    const range = seoulDayRange(date);
    expect(range.end).toBe(end);
    expect(Date.parse(range.end) - Date.parse(range.start)).toBe(86400000);
  });
  it.each(["", "2026-2-01", "2026/10/14", "2026-02-29", "2024-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "0000-01-01", "garbage"])("잘못된 날짜 %s를 거부한다", (date) => {
    expect(() => seoulDayRange(date)).toThrow(AdminListInputError);
  });
});
