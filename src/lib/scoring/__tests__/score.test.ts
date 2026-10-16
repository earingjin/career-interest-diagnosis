vi.mock("server-only", () => ({}));
import { describe, expect, it, vi } from "vitest";
import questions from "../../../content/questions.json";
import interpretations from "../../../content/interpretations.json";
import type { TypeInterpretation } from "../../../content/types";
import {
  JOBS_PER_TYPE,
  RIASEC_ORDER,
  SubmissionError,
  calculateScores,
  selectJobs,
  validateSubmission,
  type AdjectiveSelections,
  type GeneralAnswers,
  type JobSource,
  type RiasecType,
} from "../score";
import { EMPTY_JOB_CATALOG } from "../jobCatalog";
import { SCORING_VERSION } from "../version";

const realTypes = interpretations.types as Record<RiasecType, TypeInterpretation>;

function allGeneral(value: boolean): GeneralAnswers {
  return Object.fromEntries(questions.general.map((q) => [q.id, value]));
}

const allAdjectives = (): AdjectiveSelections => questions.adjectives.map((a) => a.id);

// 유형별로 [일반성향 "예" 개수, 형용사 선택 개수] 를 정해 응답을 만든다.
// 어떤 문항을 고를지는 questions.json 의 type 필드로 정한다.
function answersFor(spec: Partial<Record<RiasecType, [number, number]>>) {
  const general = allGeneral(false);
  const adjectives: AdjectiveSelections = [];
  for (const [type, [g, a]] of Object.entries(spec) as [RiasecType, [number, number]][]) {
    questions.general
      .filter((q) => q.type === type)
      .slice(0, g)
      .forEach((q) => (general[q.id] = true));
    adjectives.push(...questions.adjectives.filter((x) => x.type === type).slice(0, a).map((x) => x.id));
  }
  return { general, adjectives };
}

function jobSource(overrides: Partial<Record<RiasecType, JobSource>>): Record<RiasecType, JobSource> {
  const base = Object.fromEntries(
    RIASEC_ORDER.map((t) => [t, { seniorJobs: [], generalJobs: [] } as JobSource]),
  ) as Record<RiasecType, JobSource>;
  return { ...base, ...overrides };
}

describe("calculateScores", () => {
  it("a. 일반성향 모두 예 + 형용사 전부 선택 → 모두 12점, top1 R, top2 I, tieBroken true", () => {
    const r = calculateScores(allGeneral(true), allAdjectives());
    for (const t of RIASEC_ORDER) {
      expect(r.generalScores[t]).toBe(7);
      expect(r.adjectiveScores[t]).toBe(5);
      expect(r.totals[t]).toBe(12);
    }
    expect(r.top1).toBe("R");
    expect(r.top2).toBe("I");
    expect(r.tieBroken).toBe(true);
    expect(r.scoringVersion).toBe(SCORING_VERSION);
  });

  it("b. 일반성향 모두 아니요 + S 형용사 5개 → S 만 5점, 나머지 0, top1 S, top2 R(동점 순서), tieBroken true", () => {
    const { general, adjectives } = answersFor({ S: [0, 5] });
    const r = calculateScores(general, adjectives);
    expect(r.totals).toEqual({ R: 0, I: 0, A: 0, S: 5, E: 0, C: 0 });
    expect(r.generalScores).toEqual({ R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 });
    expect(r.adjectiveScores.S).toBe(5);
    expect(r.top1).toBe("S");
    expect(r.top2).toBe("R");
    expect(r.tieBroken).toBe(true);
  });

  it("c. S·E·C 가 9점 동점, 나머지 낮음 → top1 S, top2 E, tieBroken true", () => {
    const { general, adjectives } = answersFor({ R: [1, 0], I: [2, 0], A: [3, 0], S: [7, 2], E: [7, 2], C: [7, 2] });
    const r = calculateScores(general, adjectives);
    expect(r.totals).toEqual({ R: 1, I: 2, A: 3, S: 9, E: 9, C: 9 });
    expect(r.top1).toBe("S");
    expect(r.top2).toBe("E");
    expect(r.tieBroken).toBe(true);
  });

  it("d. R 7점, I 8점, C 8점 → top1 I, top2 C", () => {
    const { general, adjectives } = answersFor({ R: [4, 3], I: [7, 1], C: [7, 1] });
    const r = calculateScores(general, adjectives);
    expect(r.totals).toEqual({ R: 7, I: 8, A: 0, S: 0, E: 0, C: 8 });
    expect(r.top1).toBe("I");
    expect(r.top2).toBe("C");
    expect(r.tieBroken).toBe(true);
  });

  it("e. 동점이 없으면 tieBroken false", () => {
    const { general, adjectives } = answersFor({ I: [1, 0], A: [2, 0], S: [3, 0], E: [4, 0], C: [5, 5] });
    const r = calculateScores(general, adjectives);
    expect(r.totals).toEqual({ R: 0, I: 1, A: 2, S: 3, E: 4, C: 10 });
    expect(r.top1).toBe("C");
    expect(r.top2).toBe("E");
    expect(r.tieBroken).toBe(false);
  });

  it("e-2. 3위 아래의 동점은 1·2순위에 영향이 없으므로 tieBroken false", () => {
    const { general, adjectives } = answersFor({ C: [7, 3], E: [6, 2], S: [5, 0], A: [5, 0] });
    const r = calculateScores(general, adjectives);
    expect(r.totals).toEqual({ R: 0, I: 0, A: 5, S: 5, E: 8, C: 10 });
    expect(r.top1).toBe("C");
    expect(r.top2).toBe("E");
    expect(r.tieBroken).toBe(false);
  });

  it("l. 잘못된 입력을 넣으면 calculateScores 도 SubmissionError 를 던진다", () => {
    const missing = allGeneral(true);
    delete missing.g07;
    expect(() => calculateScores(missing, allAdjectives())).toThrow(SubmissionError);
    expect(() => calculateScores(allGeneral(true), ["a01", "a02"])).toThrow(SubmissionError);
    expect(() => calculateScores({ ...allGeneral(true), g43: true }, allAdjectives())).toThrow(SubmissionError);
    expect(() => calculateScores(allGeneral(true), ["a01", "a01", "a02", "a03", "a04"])).toThrow(SubmissionError);
    expect(() =>
      calculateScores({ ...allGeneral(true), g01: "yes" as unknown as boolean }, allAdjectives()),
    ).toThrow(SubmissionError);
  });
});

describe("validateSubmission", () => {
  it("올바른 제출은 통과한다", () => {
    expect(() => validateSubmission(allGeneral(false), ["a01", "a02", "a03", "a04", "a05"])).not.toThrow();
  });

  it("h. 42개 중 하나가 빠지면 빠진 번호를 메시지에 담아 throw 한다", () => {
    const general = allGeneral(true);
    delete general.g17;
    expect(() => validateSubmission(general, allAdjectives())).toThrow(SubmissionError);
    expect(() => validateSubmission(general, allAdjectives())).toThrow(/g17/);
  });

  it("i. 형용사 4개는 throw 한다", () => {
    expect(() => validateSubmission(allGeneral(true), ["a01", "a02", "a03", "a04"])).toThrow(SubmissionError);
    expect(() => validateSubmission(allGeneral(true), ["a01", "a02", "a03", "a04"])).toThrow(/5개 이상/);
  });

  it('j. 형용사 중복 "a01","a01",... 은 throw 한다', () => {
    const dup = ["a01", "a01", "a02", "a03", "a04", "a05"];
    expect(() => validateSubmission(allGeneral(true), dup)).toThrow(SubmissionError);
    expect(() => validateSubmission(allGeneral(true), dup)).toThrow(/중복.*a01/);
  });

  it('k. 알 수 없는 키 "g43" 은 throw 한다', () => {
    expect(() => validateSubmission({ ...allGeneral(true), g43: true }, allAdjectives())).toThrow(/g43/);
    expect(() => validateSubmission(allGeneral(true), [...allAdjectives().slice(0, 5), "a31"])).toThrow(/a31/);
  });
});

// 기존 seniorJobs → generalJobs 방식은 카탈로그가 비어 있을 때의 폴백 경로다. 아래 f~m-2 는 그 경로를 빈 카탈로그로 검증한다.
// 카탈로그 대표·보충 선정은 jobCatalog.test.ts 에서 검증한다.
describe("selectJobs", () => {
  it("f. 1·2순위 목록에 같은 이름이 있으면 1순위에서만 나오고 2순위는 다음 직업으로 채운다", () => {
    const source = jobSource({
      R: { seniorJobs: ["r1", "공통", "r3", "r4", "r5"], generalJobs: [] },
      I: { seniorJobs: ["i1", "공통", "i3", "i4", "i5", "i6"], generalJobs: [] },
    });
    const [first, second] = selectJobs("R", "I", source, EMPTY_JOB_CATALOG);
    expect(first.jobs).toEqual(["r1", "공통", "r3", "r4", "r5"]);
    expect(second.jobs).toEqual(["i1", "i3", "i4", "i5", "i6"]);
    expect(second.count).toBe(5);
  });

  it("f-2. 한 유형 안의 중복 이름은 한 번만 쓴다", () => {
    const source = jobSource({
      R: { seniorJobs: ["r1", "r1"], generalJobs: ["r1", "r2", "r3", "r4"] },
      I: { seniorJobs: ["i1", "i2", "i3", "i4", "i5"], generalJobs: [] },
    });
    expect(selectJobs("R", "I", source, EMPTY_JOB_CATALOG)[0].jobs).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("g. A 유형 고령자 목록이 1개뿐이면 일반성인 목록에서 4개를 순서대로 보충한다", () => {
    expect(realTypes.A.seniorJobs).toHaveLength(1);
    const [first] = selectJobs("A", "R", undefined, EMPTY_JOB_CATALOG);
    expect(first.type).toBe("A");
    expect(first.jobs).toEqual([realTypes.A.seniorJobs[0], ...realTypes.A.generalJobs.slice(0, 4)]);
    expect(first.count).toBe(5);
  });

  it("목록이 부족하면 채운 만큼만 돌려주고 count 로 드러낸다", () => {
    const source = jobSource({
      R: { seniorJobs: ["r1"], generalJobs: ["r2"] },
      I: { seniorJobs: ["r1", "r2"], generalJobs: [] },
    });
    const [first, second] = selectJobs("R", "I", source, EMPTY_JOB_CATALOG);
    expect(first).toEqual({ type: "R", jobs: ["r1", "r2"], count: 2 });
    expect(second).toEqual({ type: "I", jobs: [], count: 0 });
  });

  it("m. 모든 1·2순위 조합에서 jobs 에 앞뒤 공백·빈 문자열·중복이 없고 5+5 개가 나온다", () => {
    for (const top1 of RIASEC_ORDER) {
      for (const top2 of RIASEC_ORDER) {
        if (top1 === top2) continue;
        const recs = selectJobs(top1, top2);
        expect(recs.map((r) => r.type)).toEqual([top1, top2]);
        const all = recs.flatMap((r) => r.jobs);
        for (const job of all) {
          expect(job).toBe(job.trim());
          expect(job).not.toBe("");
        }
        expect(new Set(all).size).toBe(all.length);
        for (const r of recs) expect(r.count).toBe(JOBS_PER_TYPE);
      }
    }
  });

  it("m-2. 원본 이름의 앞뒤 공백과 빈 문자열은 정리된다", () => {
    const source = jobSource({
      R: { seniorJobs: ["  r1 ", "", "   ", "r1"], generalJobs: ["r2"] },
      I: { seniorJobs: [" r2"], generalJobs: ["i1"] },
    });
    const [first, second] = selectJobs("R", "I", source, EMPTY_JOB_CATALOG);
    expect(first.jobs).toEqual(["r1", "r2"]);
    expect(second.jobs).toEqual(["i1"]);
  });
});

describe("결과 계산 버전 (results.scoring_version)", () => {
  it("추천직업 선정 규칙이 카탈로그 대표 우선으로 바뀐 것을 구분하도록 1.1.0 이다", () => {
    expect(SCORING_VERSION).toBe("1.1.0");
    expect(SCORING_VERSION).toMatch(/^[0-9]+[.][0-9]+[.][0-9]+$/);
  });

  it("calculateScores 가 이 버전을 담고, 점수·순위·동점 처리는 1.0.0 시절과 같다 (모두 예·모두 선택 입력)", () => {
    const r = calculateScores(allGeneral(true), allAdjectives());
    expect(r.scoringVersion).toBe(SCORING_VERSION);
    expect(r.generalScores).toEqual({ R: 7, I: 7, A: 7, S: 7, E: 7, C: 7 });
    expect(r.adjectiveScores).toEqual({ R: 5, I: 5, A: 5, S: 5, E: 5, C: 5 });
    expect(r.totals).toEqual({ R: 12, I: 12, A: 12, S: 12, E: 12, C: 12 });
    expect([r.top1, r.top2, r.tieBroken]).toEqual(["R", "I", true]); // 동점이면 RIASEC 순서
  });
});
