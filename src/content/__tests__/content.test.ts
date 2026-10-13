import { describe, expect, it } from "vitest";
import questions from "../questions.json";
import interpretations from "../interpretations.json";
import { RIASEC_ORDER } from "../types";
import { CONTENT_VERSION } from "../version";

const countByType = (items: { type: string }[]) =>
  Object.fromEntries(RIASEC_ORDER.map((t) => [t, items.filter((i) => i.type === t).length]));

describe("version", () => {
  it("json 파일 버전이 CONTENT_VERSION 과 같다", () => {
    expect(questions.version).toBe(CONTENT_VERSION);
    expect(interpretations.version).toBe(CONTENT_VERSION);
  });
});

describe("questions", () => {
  const { general, adjectives } = questions;

  it("general 은 42개, 유형별 7개씩이다", () => {
    expect(general).toHaveLength(42);
    for (const t of RIASEC_ORDER) expect(countByType(general)[t]).toBe(7);
  });

  it("adjectives 는 30개, 유형별 5개씩이다", () => {
    expect(adjectives).toHaveLength(30);
    for (const t of RIASEC_ORDER) expect(countByType(adjectives)[t]).toBe(5);
  });

  it("모든 id 는 중복되지 않는다", () => {
    const ids = [...general, ...adjectives].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("order 는 1부터 빠짐없이 이어진다", () => {
    expect(general.map((q) => q.order)).toEqual(Array.from({ length: 42 }, (_, i) => i + 1));
    expect(adjectives.map((q) => q.order)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("part 값과 텍스트가 올바르다", () => {
    expect(general.every((q) => q.part === 1 && q.text.trim() === q.text && q.text !== "")).toBe(true);
    expect(adjectives.every((q) => q.part === 2 && q.text.trim() === q.text && q.text !== "")).toBe(true);
  });
});

describe("interpretations", () => {
  const stringFields = [
    "nameKo", "nameEn", "subtitle", "interest", "selfEvaluation", "othersEvaluation",
    "preferredActivity", "aptitude", "personality", "value", "avoidedActivity",
  ] as const;

  it.each(RIASEC_ORDER)("%s 유형 해설의 모든 필드가 채워져 있다", (t) => {
    const item = interpretations.types[t];
    expect(item).toBeDefined();
    expect(item.type).toBe(t);
    for (const f of stringFields) expect(item[f].trim(), `${t}.${f}`).not.toBe("");
  });

  it.each(RIASEC_ORDER)("%s 유형의 직업 목록이 있고 공백이 없다", (t) => {
    const { generalJobs, seniorJobs } = interpretations.types[t];
    expect(generalJobs.length).toBeGreaterThanOrEqual(1);
    expect(seniorJobs.length).toBeGreaterThanOrEqual(1);
    for (const job of [...generalJobs, ...seniorJobs]) {
      expect(job).not.toBe("");
      expect(job).toBe(job.trim());
    }
  });
});
