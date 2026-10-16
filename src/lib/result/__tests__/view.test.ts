import { describe, expect, it } from "vitest";
import combinedDetails from "../../../content/combined-details.json";
import combinedInterpretations from "../../../content/combined-interpretations.json";
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
  combinedInterpretations,
  combinedDetails,
});

// S 10점, E 8점, C 3점
const normalRow = () => makeRow({ S: 7, E: 6, C: 3 }, { S: 3, E: 2 }, "S", "E");

describe("buildResultView: 묶음과 라벨", () => {
  const view = buildResultView(base(normalRow()));

  it("groups 는 정확히 4개이고 title 순서가 고정이다", () => {
    for (const section of [view.top1, view.top2]) {
      expect(section.groups.map((g) => g.title)).toEqual(["나의 직업흥미 특성", "선호하는 활동과 업무 환경", "경력 활용과 진로 탐색", "추천직업과 확인사항"]);
    }
  });

  it("4개 영역에 핵심흥미·활동·탐색·확인사항이 빠짐없이 들어가고 항목명이 겹치지 않는다", () => {
    const labels = view.top1.groups.flatMap((g) => g.items.map((i) => i.label));
    expect(view.top1.groups.map((g) => g.items.length)).toEqual([2, 3, 2, 1]);
    expect(labels).toEqual(["핵심흥미", "업무방식", "선호활동", "업무환경", "부담활동", "경험활용", "탐색방향", "확인사항"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("해설 문장은 해당 유형의 interpretations 값이다", () => {
    const s = interpretations.types.S;
    expect(view.top1.groups[0].items.map((i) => i.text)).toEqual([s.interest, s.workStyle]);
    expect(view.top1.groups[1].items.map((i) => i.text)).toEqual([s.preferredActivity, s.workEnvironment, s.burdensomeActivity]);
    expect(view.top1.groups[2].items.map((i) => i.text)).toEqual([s.careerUse, s.careerExplore]);
    expect(view.top1.groups[3].items.map((i) => i.text)).toEqual([s.careerCheck]);
    expect(view.top1.keywords).toBe(s.keywords.join(" · "));
    expect(view.top1.nameKo).toBe(s.nameKo);
    expect(view.top1.nameEn).toBe(s.nameEn);
    expect(view.top1.subtitle).toBe(s.subtitle);
  });

  it("키워드는 요약에만 있고 본문 영역 항목으로 반복하지 않는다", () => {
    for (const section of [view.top1, view.top2]) {
      const texts = section.groups.flatMap((g) => g.items.map((i) => i.text));
      expect(texts).not.toContain(section.keywords);
      expect(section.groups.flatMap((g) => g.items.map((i) => i.label))).not.toContain("키워드");
    }
  });

  it("두 순위에 공통인 안내는 영역에 넣지 않고 결과 전체에 한 번만 담는다", () => {
    expect(view.commonNotes).toEqual(interpretations.commonNotes);
    // 점수 합산의 의미, 종합 해석의 성격, 흥미 ≠ 능력·자격·취업 가능성, 실제 업무·채용요건 확인
    const notes = view.commonNotes.join(" ");
    expect(view.commonNotes).toHaveLength(4);
    for (const phrase of ["유형별 응답을 합산한 값", "별도의 조합검사 결과가 아닙니다", "능력·자격이나 취업 가능성을 확정하지 않습니다", "실제 업무와 채용요건"]) {
      expect(notes, phrase).toContain(phrase);
    }
    // 점수에 등급이나 기준점을 붙이지 않는다.
    expect(notes).not.toMatch(/등급|기준점|이상이면|이하이면|높음|낮음/);
    const json = JSON.stringify(view);
    for (const note of view.commonNotes) expect(json.split(JSON.stringify(note).slice(1, -1)).length - 1, note).toBe(1);
    for (const section of [view.top1, view.top2]) {
      for (const group of section.groups) expect(group).not.toHaveProperty("note");
    }
  });

  it("정상 결과에는 1·2순위 해설만 포함하고 다른 유형의 원문은 전달하지 않는다", () => {
    const json = JSON.stringify(view);
    for (const type of RIASEC_ORDER) {
      const copy = interpretations.types[type];
      if (type === "S" || type === "E") expect(json).toContain(copy.interest);
      else for (const marker of [copy.interest, copy.careerUse, copy.careerCheck]) expect(json).not.toContain(marker);
    }
    expect(json).not.toContain("seniorJobs");
    expect(json).not.toContain("generalJobs");
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
      ["combinedDetail", "combinedInterpretation", "commonNotes", "courseName", "nickname", "scoringVersion", "submittedAt", "top1", "top2", "totals"].sort(),
    );
    const json = JSON.stringify(view);
    for (const column of ["general_scores", "adjective_scores", "job_recommendations", "tie_broken"]) {
      expect(json, column).not.toContain(column);
    }
  });
});

describe("buildResultView: 1·2순위 종합 해석", () => {
  const combinationsOf = () =>
    RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => [a, b] as const));
  /** a 가 1순위, b 가 2순위가 되도록 점수를 만든다. */
  const rowFor = (a: RiasecType, b: RiasecType) => makeRow({ [a]: 7, [b]: 5 }, { [a]: 2, [b]: 1 }, a, b);

  it("1순위+2순위 키(예: S·E → SE)의 세 문장만 그대로 담는다", () => {
    const view = buildResultView(base(normalRow()));
    expect(view.combinedInterpretation).toEqual(combinedInterpretations.combinations.SE);
    expect(Object.keys(view.combinedInterpretation).sort()).toEqual(["explanation", "exploration", "summary"]);
  });

  it("1·2순위를 뒤집으면 다른 조합(ES) 문안을 고른다", () => {
    const se = buildResultView(base(rowFor("S", "E"))).combinedInterpretation;
    const es = buildResultView(base(rowFor("E", "S"))).combinedInterpretation;
    expect(se).toEqual(combinedInterpretations.combinations.SE);
    expect(es).toEqual(combinedInterpretations.combinations.ES);
    expect(es).not.toEqual(se);
  });

  it("30개 조합을 모두 조회할 수 있고, 다른 29개 조합의 문장은 뷰에 담기지 않는다", () => {
    const all = combinedInterpretations.combinations as Record<string, Record<string, string>>;
    const keys = combinationsOf().map(([a, b]) => a + b);
    expect(keys).toHaveLength(30);
    for (const [a, b] of combinationsOf()) {
      const view = buildResultView(base(rowFor(a, b)));
      expect(view.combinedInterpretation, a + b).toEqual(all[a + b]);
      const json = JSON.stringify(view);
      for (const other of keys.filter((key) => key !== a + b)) {
        for (const text of Object.values(all[other])) {
          // 문장이 다른 조합과 우연히 같을 때는 비교에서 뺀다.
          if (!Object.values(all[a + b]).includes(text)) expect(json, `${a + b} 에 ${other}`).not.toContain(text);
        }
      }
    }
  });

  it("조합 문안이 없거나 비어 있으면 임의의 해설 대신 ResultViewError 로 거부한다", () => {
    const missing = { combinations: { ...combinedInterpretations.combinations, SE: undefined } } as never;
    expect(() => buildResultView({ ...base(normalRow()), combinedInterpretations: missing })).toThrow(/SE 조합/);
    const blank = { combinations: { SE: { summary: " ", explanation: "a", exploration: "b" } } };
    expect(() => buildResultView({ ...base(normalRow()), combinedInterpretations: blank })).toThrow(ResultViewError);
    const inherited = { combinations: Object.create({ SE: combinedInterpretations.combinations.SE }) };
    expect(() => buildResultView({ ...base(normalRow()), combinedInterpretations: inherited })).toThrow(ResultViewError);
  });
});

describe("buildResultView: 1·2순위 상세 해석", () => {
  const combinationsOf = () =>
    RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => [a, b] as const));
  const rowFor = (a: RiasecType, b: RiasecType) => makeRow({ [a]: 7, [b]: 5 }, { [a]: 2, [b]: 1 }, a, b);
  const all = combinedDetails.combinations as Record<string, Record<string, string>>;

  it("1순위+2순위 키의 세 항목(together·connect·balance)만 담는다", () => {
    const view = buildResultView(base(normalRow()));
    expect(view.combinedDetail).toEqual(all.SE);
    expect(Object.keys(view.combinedDetail).sort()).toEqual(["balance", "connect", "together"]);
  });

  it("30개 조합 모두 조회되고, 순서를 뒤집으면 다른 문안이며, 다른 조합 문안은 뷰에 없다", () => {
    const keys = combinationsOf().map(([a, b]) => a + b);
    for (const [a, b] of combinationsOf()) {
      const view = buildResultView(base(rowFor(a, b)));
      expect(view.combinedDetail, a + b).toEqual(all[a + b]);
      expect(view.combinedDetail, a + b).not.toEqual(all[b + a]);
      const json = JSON.stringify(view);
      for (const other of keys.filter((key) => key !== a + b)) {
        for (const text of Object.values(all[other])) expect(json, `${a + b} 에 ${other}`).not.toContain(text);
      }
    }
  });

  it("관리용 메타 정보(version·reviewStatus)는 뷰에 담기지 않는다", () => {
    const json = JSON.stringify(buildResultView(base(normalRow())));
    expect(json).not.toContain("reviewStatus");
    expect(json).not.toContain("draft-needs-review");
  });

  it("상세 해석이 없거나 비어 있으면 ResultViewError 로 거부한다", () => {
    const missing = { combinations: { ...combinedDetails.combinations, SE: undefined } } as never;
    expect(() => buildResultView({ ...base(normalRow()), combinedDetails: missing })).toThrow(/SE 조합의 상세 해석/);
    const blank = { combinations: { SE: { together: "a", connect: " ", balance: "b" } } };
    expect(() => buildResultView({ ...base(normalRow()), combinedDetails: blank })).toThrow(ResultViewError);
    const inherited = { combinations: Object.create({ SE: combinedDetails.combinations.SE }) };
    expect(() => buildResultView({ ...base(normalRow()), combinedDetails: inherited })).toThrow(ResultViewError);
  });
});
