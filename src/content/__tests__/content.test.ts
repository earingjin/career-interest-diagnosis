import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import questions from "../questions.json";
import { readFileSync } from "node:fs";
import path from "node:path";
import combinedInterpretations from "../combined-interpretations.json";
import interpretations from "../interpretations.json";
import { RIASEC_ORDER } from "../types";
import { COMBINED_INTERPRETATIONS_VERSION, CONTENT_VERSION, INTERPRETATIONS_VERSION } from "../version";

const countByType = (items: { type: string }[]) =>
  Object.fromEntries(RIASEC_ORDER.map((t) => [t, items.filter((i) => i.type === t).length]));

describe("version", () => {
  it("문항 버전은 유지하고 해설 버전만 분리한다", () => {
    expect(questions.version).toBe(CONTENT_VERSION);
    expect(interpretations.version).toBe(INTERPRETATIONS_VERSION);
    expect(CONTENT_VERSION).toBe("1.0.0");
    expect(INTERPRETATIONS_VERSION).toBe("2.2.0");
    expect(combinedInterpretations.version).toBe(COMBINED_INTERPRETATIONS_VERSION);
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
    "nameKo", "nameEn", "subtitle", "interest", "workStyle", "preferredActivity",
    "workEnvironment", "burdensomeActivity", "careerUse", "careerExplore", "careerCheck",
  ] as const;

  it("1·2순위 공통 안내는 유형별 필드가 아니라 파일에 한 번만 있다", () => {
    expect(interpretations.commonNotes.length).toBeGreaterThanOrEqual(1);
    expect(interpretations.commonNotes.every((note) => note.trim() === note && note !== "")).toBe(true);
    for (const t of RIASEC_ORDER) expect(interpretations.types[t]).not.toHaveProperty("jobCheck");
  });

  it("고객에게 보이는 해설·안내에 특정 연령대 표현이 없다 (seniorJobs 필드명은 내부용)", () => {
    const visible = [
      ...interpretations.commonNotes,
      ...RIASEC_ORDER.flatMap((t) => [...stringFields.map((f) => interpretations.types[t][f]), ...interpretations.types[t].keywords]),
    ];
    for (const text of visible) expect(text).not.toMatch(/중장년|장년|고령|시니어|노년|어르신|노인/);
  });

  it.each(RIASEC_ORDER)("%s 유형 해설의 모든 필드가 채워져 있다", (t) => {
    const item = interpretations.types[t];
    expect(item).toBeDefined();
    expect(item.type).toBe(t);
    for (const f of stringFields) expect(item[f].trim(), `${t}.${f}`).not.toBe("");
    expect(item.keywords.length).toBeGreaterThanOrEqual(3);
    expect(item.keywords.length).toBeLessThanOrEqual(4);
    expect(new Set(item.keywords).size).toBe(item.keywords.length);
    expect(item.keywords.every((word) => word.trim().length > 0)).toBe(true);
  });

  it("59e1d01의 추천직업명·배열 순서를 그대로 보존한다", () => {
    const jobs = Object.fromEntries(RIASEC_ORDER.map((type) => [type, {
      seniorJobs: interpretations.types[type].seniorJobs,
      generalJobs: interpretations.types[type].generalJobs,
    }]));
    expect(createHash("sha256").update(JSON.stringify(jobs)).digest("hex"))
      .toBe("2f147692ce99b7d2d1ab7e1d69ee280987ec2ff602c9901f8739d85680360abe");
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

describe("combined-interpretations (1·2순위 조합 종합 해석)", () => {
  const combinations = combinedInterpretations.combinations as Record<string, Record<string, unknown>>;
  const expectedKeys = RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => a + b));

  it("정확히 30개이고, 모든 키가 서로 다른 두 RIASEC 유형(1순위+2순위)이다", () => {
    expect(expectedKeys).toHaveLength(30);
    expect(Object.keys(combinations).sort()).toEqual([...expectedKeys].sort());
    for (const key of Object.keys(combinations)) {
      expect(key, key).toMatch(/^[RIASEC]{2}$/);
      expect(key[0], key).not.toBe(key[1]);
    }
  });

  it("원본 파일에 같은 조합 키가 두 번 나오지 않는다 (JSON.parse 는 중복 키를 덮어쓰므로 원문으로 확인)", () => {
    const raw = readFileSync(path.join(process.cwd(), "src/content/combined-interpretations.json"), "utf8");
    const keys = [...raw.matchAll(/"([RIASEC]{2})"s*:/g)].map((m) => m[1]);
    expect(keys).toHaveLength(30);
    expect(new Set(keys).size).toBe(30);
  });

  it.each(expectedKeys)("%s 조합에 summary·explanation·exploration 세 문장만 있고 비어 있지 않다", (key) => {
    const entry = combinations[key];
    expect(Object.keys(entry).sort()).toEqual(["explanation", "exploration", "summary"]);
    for (const field of ["summary", "explanation", "exploration"]) {
      const text = entry[field];
      expect(typeof text, `${key}.${field}`).toBe("string");
      expect((text as string).trim(), `${key}.${field}`).not.toBe("");
      expect(text, `${key}.${field}`).toBe((text as string).trim());
    }
    expect(new Set(Object.values(entry)).size, key).toBe(3);
  });

  it("1·2순위를 뒤집은 조합은 별개의 문안이다", () => {
    for (const key of expectedKeys) {
      expect(combinations[key], key).not.toEqual(combinations[key[1] + key[0]]);
    }
  });

  it("특정 연령대 표현이 없다", () => {
    expect(JSON.stringify(combinations)).not.toMatch(/중장년|장년|고령|시니어|노년|어르신|노인/);
  });
});
