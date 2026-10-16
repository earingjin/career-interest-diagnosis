vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import catalogJson from "../../../content/job-catalog.json";
import combinedDetails from "../../../content/combined-details.json";
import combinedInterpretations from "../../../content/combined-interpretations.json";
import interpretations from "../../../content/interpretations.json";
import type { JobCatalog, RiasecType, TypeInterpretation } from "../../../content/types";
import { RIASEC_ORDER, selectJobs, type JobSource } from "../../scoring/score";
import { ResultScreen } from "@/app/c/[courseCode]/result/ResultScreen";
import { buildResultView } from "../view";

// 추천직업(카탈로그 대표든 기존 목록 폴백이든)은 자격·채용 가능성이 검증됐다고 표현하지 않는다.
// 직업명·자격·선발 조건은 모두 미검증 상태이고, 화면에는 "확정하지 않는다"는 공통 안내만 있다.

const catalog = catalogJson as unknown as JobCatalog;
const legacy = interpretations.types as unknown as Record<RiasecType, JobSource & TypeInterpretation>;
const pairs = RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => [a, b] as const));

/** 긍정적 보증으로 읽힐 수 있는 표현. 기존 안내문("…확정하지 않습니다")과 해설 문장은 걸리지 않는 구체적인 형태만 둔다. */
const FORBIDDEN: [string, RegExp][] = [
  ["채용 보장·확정·가능 단정", /채용(이|을|은)?\s?(보장|확정|가능합니다|됩니다)/],
  ["취업 보장·확정·가능 단정", /취업(이|을|은)?\s?(보장|확정|가능합니다|됩니다)/],
  ["자격·조건 검증·충족 단정", /(자격|면허|선발|채용|취업)\s?(조건)?(이|을|은)?\s?(검증|충족|확인되었|확인됐|확인 완료)/],
  ["검증 완료 표현", /검증\s?(된|됨|완료|을 마쳤)/],
  ["공식·인증 표현", /(공식|인증)\s?(추천|직업|직무)/],
];

const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

function viewFor(top1: RiasecType, top2: RiasecType, jobRecommendations: unknown) {
  const scores = { R: 1, I: 1, A: 1, S: 1, E: 1, C: 1, [top1]: 9, [top2]: 8 };
  return buildResultView({
    result: {
      scoring_version: "1.1.0", general_scores: scores, adjective_scores: { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 }, totals: scores,
      top1, top2, job_recommendations: jobRecommendations,
    },
    nickname: "홍길동", courseName: "과정", submittedAt: "2026-10-14T03:00:00.000Z",
    interpretations: interpretations as never, combinedInterpretations: combinedInterpretations as never, combinedDetails: combinedDetails as never,
  });
}

const without = (type: RiasecType, indexes: number[]) => {
  const c = structuredClone(catalog);
  for (const i of indexes) c.display.find((d) => d.id === c.representatives[type][i].displayId)!.displayReview = "needs-review";
  return c;
};

describe("추천직업 표현: 검증·보증 표현이 없고 '확정하지 않는다' 안내가 있다", () => {
  const scenarios: [string, (a: RiasecType, b: RiasecType) => ReturnType<typeof selectJobs>][] = [
    ["대표 5개 그대로", (a, b) => selectJobs(a, b)],
    ["대표 1개 제외 → 기존 목록 폴백 1개", (a, b) => selectJobs(a, b, legacy, without(a, [2]))],
    ["대표 전부 제외 → 기존 목록 폴백만", (a, b) => selectJobs(a, b, legacy, without(a, [0, 1, 2, 3, 4]))],
  ];

  for (const [label, make] of scenarios) {
    it(`${label}: 30개 조합의 고객 화면과 A4 결과지에 보증 표현이 없다`, () => {
      for (const [a, b] of pairs) {
        const view = viewFor(a, b, make(a, b));
        for (const mode of ["mobile", "print"] as const) {
          const body = text(renderToStaticMarkup(<ResultScreen view={view} mode={mode} />));
          for (const [name, pattern] of FORBIDDEN) expect(body, `${a}${b} ${mode} ${name}`).not.toMatch(pattern);
          // 추천직업과 자격·취업 가능성에 대한 공통 안내는 항상 있다.
          expect(body, `${a}${b} ${mode}`).toContain("직업흥미와 추천직업은 능력·자격이나 취업 가능성을 확정하지 않습니다.");
          expect(body, `${a}${b} ${mode}`).toContain("관심 있는 직업의 실제 업무와 채용요건은 별도로 확인하세요.");
        }
      }
    });
  }

  it("금지 표현 패턴이 실제로 보증 문구를 잡는다 (패턴 자체 점검)", () => {
    for (const sample of ["채용이 보장됩니다", "취업을 확정합니다", "자격이 검증된 직업", "검증 완료", "공식 추천 직업", "면허 충족"]) {
      expect(FORBIDDEN.some(([, p]) => p.test(sample)), sample).toBe(true);
    }
    for (const sample of ["직업흥미와 추천직업은 능력·자격이나 취업 가능성을 확정하지 않습니다.", "실제 업무와 채용요건은 별도로 확인하세요.", "필수 자격, 실습, 감정 부담, 체력과 근무시간을 확인하세요."]) {
      expect(FORBIDDEN.some(([, p]) => p.test(sample)), sample).toBe(false);
    }
  });

  it("카탈로그 데이터도 직업명·자격·선발 조건을 검증된 것으로 기록하지 않는다", () => {
    for (const d of catalog.display) expect(d.verification.name, d.id).toBe("unverified");
    for (const s of catalog.sources) if (s.needsCheck) expect(s.needsCheck.confirmed, s.id).toBe(false);
  });
});
