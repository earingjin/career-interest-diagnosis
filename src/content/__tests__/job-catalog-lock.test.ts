import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import catalog from "../job-catalog.json";
import { JOB_CATALOG_VERSION } from "../version";

const LOCK: Record<string, string> = {
  "0.2.0": "7d14b1a2bb4cd0482ddf76125c4dcfef101d5206d19fad2f4bbfae214f3d6bda",
  "1.0.0": "26a44f18e551640d3536a8efba50c75d8ba24cd1b4e68dbc96b9c25730b0b779",
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("추천직업 카탈로그 변경 감지", () => {
  it("버전과 전체 내용의 해시가 기록된 원본과 일치한다", () => {
    expect(catalog.version).toBe(JOB_CATALOG_VERSION);
    const hash = createHash("sha256").update(canonical(catalog)).digest("hex");
    expect(hash).toBe(LOCK[JOB_CATALOG_VERSION]);
    expect(catalog.document.file).toBe("추천직업최신.pdf");
    expect(catalog.document.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
