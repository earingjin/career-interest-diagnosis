import { describe, expect, it } from "vitest";
import interpretations from "../../../content/interpretations.json";
import { RIASEC_ORDER, type RiasecType } from "../../../content/types";
import { buildResultView, ResultViewError, type ResultRow } from "../view";

type Scores = Record<RiasecType, number>;
const scores = (s: Partial<Scores>): Scores => ({ R: 0, I: 0, A: 0, S: 0, E: 0, C: 0, ...s });

/** 일반성향 점수, 형용사 점수, 1·2순위로 results 행을 만든다. 합계는 둘의 합이다. */
function makeRow(
  general: Partial<Scores>,
  adjective: Partial<Scores>,
  top1: string,
  top2: string,
  jobsByType: Partial<Record<RiasecType, unknown>> = {},
): ResultRow {
  const g = scores(general);
  const a = scores(adjective);
  const totals = Object.fromEntries(RIASEC_ORDER.map((t) => [t, g[t] + a[t]]));
  return {
    scoring_version: "1.0.0",
    general_scores: g,
    adjective_scores: a,
    totals,
    top1,
    top2,
    job_recommendations: [top1, top2].map((type) => ({
      type,
      jobs: jobsByType[type as RiasecType] ?? [`${type}직업1`, `${type}직업2`, `${type}직업3`, `${type}직업4`, `${type}직업5`],
      count: 5,
    })),
  };
}

const base = (result: ResultRow) => ({
  result,
  nickname: "검증1234",
  courseName: "테스트 과정",
  submittedAt: "2026-10-15T03:04:05.000Z",
  interpretations,
});

// S 10점, E 8점, C 3점
const normalRow = () => makeRow({ S: 7, E: 6, C: 3 }, { S: 3, E: 2 }, "S", "E");

describe("buildResultView: 묶음과 라벨", () => {
  const view = buildResultView(base(normalRow()));

  it("groups 는 정확히 4개이고 title 순서가 고정이다", () => {
    for (const section of [view.top1, view.top2]) {
      expect(section.groups.map((g) => g.title)).toEqual(["나의 흥미", "나의 활동", "나의 역량", "나의 성향"]);
    }
  });

  it("묶음마다 항목 2개, 라벨은 8개이고 중복이 없다", () => {
    const labels = view.top1.groups.flatMap((g) => g.items.map((i) => i.label));
    expect(view.top1.groups.every((g) => g.items.length === 2)).toBe(true);
    expect(labels).toEqual(["흥미특성", "가치", "선호활동", "회피활동", "적성", "자기평가", "성격", "타인평가"]);
    expect(new Set(labels).size).toBe(8);
  });

  it("해설 문장은 해당 유형의 interpretations 값이다", () => {
    const s = interpretations.types.S;
    const [interest, value] = view.top1.groups[0].items;
    expect(interest.text).toBe(s.interest);
    expect(value.text).toBe(s.value);
    expect(view.top1.groups[3].items.map((i) => i.text)).toEqual([s.personality, s.othersEvaluation]);
    expect(view.top1.nameKo).toBe(s.nameKo);
    expect(view.top1.nameEn).toBe(s.nameEn);
    expect(view.top1.subtitle).toBe(s.subtitle);
  });

  it("top1·top2 의 type 과 추천직업이 맞다", () => {
    expect(view.top1.type).toBe("S");
    expect(view.top2.type).toBe("E");
    expect(view.top1.jobs).toEqual(["S직업1", "S직업2", "S직업3", "S직업4", "S직업5"]);
    expect(view.top2.jobs).toHaveLength(5);
  });

  it("기본 정보를 그대로 담는다", () => {
    expect(view.nickname).toBe("검증1234");
    expect(view.courseName).toBe("테스트 과정");
    expect(view.submittedAt).toBe("2026-10-15T03:04:05.000Z");
    expect(view.scoringVersion).toBe("1.0.0");
  });
});

describe("buildResultView: totals", () => {
  const view = buildResultView(base(normalRow()));

  it("6개이고 RIASEC 순서다", () => {
    expect(view.totals.map((t) => t.type)).toEqual([...RIASEC_ORDER]);
  });

  it("emphasized 는 정확히 2개이고 1·2순위다", () => {
    expect(view.totals.filter((t) => t.emphasized)).toHaveLength(2);
    expect(view.totals.filter((t) => t.emphasized).map((t) => t.type)).toEqual(["S", "E"]);
  });

  it("합계, 일반성향, 형용사 점수를 담는다", () => {
    expect(view.totals.find((t) => t.type === "S")).toEqual({
      type: "S",
      nameKo: "사회형",
      total: 10,
      general: 7,
      adjective: 3,
      emphasized: true,
    });
    expect(view.totals.find((t) => t.type === "C")?.emphasized).toBe(false);
  });
});

describe("buildResultView: 1·2순위 검증", () => {
  it("가장 높은 점수 유형이 top1 이어야 한다", () => {
    expect(() => buildResultView(base(makeRow({ S: 7, E: 6 }, {}, "E", "S")))).toThrow(ResultViewError);
    expect(() => buildResultView(base(makeRow({ S: 7, E: 6, C: 3 }, {}, "S", "C")))).toThrow(ResultViewError);
  });

  it("동점이면 RIASEC 순서를 따른다 (앞선 유형이 앞)", () => {
    expect(buildResultView(base(makeRow({ S: 7, E: 7, C: 7 }, {}, "S", "E"))).top1.type).toBe("S");
    expect(() => buildResultView(base(makeRow({ S: 7, E: 7, C: 7 }, {}, "E", "S")))).toThrow(ResultViewError);
    expect(() => buildResultView(base(makeRow({ S: 7, E: 7, C: 7 }, {}, "S", "C")))).toThrow(ResultViewError);
  });

  it("전부 동점이면 R, I 가 1·2순위다", () => {
    const row = makeRow({ R: 7, I: 7, A: 7, S: 7, E: 7, C: 7 }, { R: 5, I: 5, A: 5, S: 5, E: 5, C: 5 }, "R", "I");
    const view = buildResultView(base(row));
    expect([view.top1.type, view.top2.type]).toEqual(["R", "I"]);
    expect(view.totals.every((t) => t.total === 12)).toBe(true);
    expect(view.totals.filter((t) => t.emphasized)).toHaveLength(2);
  });

  it("top1 과 top2 가 같거나 유형이 아니면 거부한다", () => {
    expect(() => buildResultView(base(makeRow({ S: 7 }, {}, "S", "S")))).toThrow(ResultViewError);
    expect(() => buildResultView(base(makeRow({ S: 7 }, {}, "X", "S")))).toThrow(ResultViewError);
  });

  it("합계가 두 점수의 합과 다르면 거부한다", () => {
    const row = normalRow();
    row.totals = { ...(row.totals as Scores), S: 11 };
    expect(() => buildResultView(base(row))).toThrow(ResultViewError);
  });

  it("점수 형식이 잘못되면 거부한다", () => {
    const row = normalRow();
    row.totals = { R: 1 };
    expect(() => buildResultView(base(row))).toThrow(ResultViewError);
  });
});

describe("buildResultView: 추천직업", () => {
  it("count 가 jobs.length 와 다르면 거부한다", () => {
    const row = normalRow();
    row.job_recommendations = [
      { type: "S", jobs: ["a", "b"], count: 5 },
      { type: "E", jobs: ["c"], count: 1 },
    ];
    expect(() => buildResultView(base(row))).toThrow(/count/);
  });

  it("count 가 없어도 jobs 를 그대로 쓴다", () => {
    const row = normalRow();
    row.job_recommendations = [
      { type: "S", jobs: ["a", "b"] },
      { type: "E", jobs: [] },
    ];
    const view = buildResultView(base(row));
    expect(view.top1.jobs).toEqual(["a", "b"]);
    expect(view.top2.jobs).toEqual([]);
  });

  it("해당 유형의 추천직업이 없으면 거부한다", () => {
    const row = normalRow();
    row.job_recommendations = [{ type: "S", jobs: ["a"], count: 1 }];
    expect(() => buildResultView(base(row))).toThrow(ResultViewError);
    row.job_recommendations = "x";
    expect(() => buildResultView(base(row))).toThrow(ResultViewError);
  });

  it("문자열이 아닌 직업이 섞이면 거부한다", () => {
    const row = normalRow();
    row.job_recommendations = [
      { type: "S", jobs: ["a", 3], count: 2 },
      { type: "E", jobs: [], count: 0 },
    ];
    expect(() => buildResultView(base(row))).toThrow(ResultViewError);
  });
});

describe("buildResultView: 민감한 값", () => {
  const view = buildResultView(base(normalRow()));

  it('JSON 에 "sessionId", "token", "phone" 이 없다', () => {
    const json = JSON.stringify(view);
    for (const word of ["sessionId", "session_id", "token", "phone"]) {
      expect(json, word).not.toContain(word);
    }
  });

  it("최상위 키는 화면에 쓰는 값뿐이고 원본 results 행의 키가 없다", () => {
    expect(Object.keys(view).sort()).toEqual(
      ["courseName", "nickname", "scoringVersion", "submittedAt", "top1", "top2", "totals"].sort(),
    );
    const json = JSON.stringify(view);
    for (const column of ["general_scores", "adjective_scores", "job_recommendations", "tie_broken"]) {
      expect(json, column).not.toContain(column);
    }
  });
});
