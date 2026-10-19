import { RIASEC_ORDER, type RiasecType } from "../../content/types";

/** Beta v1: raw totals on the existing 0–12 scale, not population norms.
 * Mean >= 6 (half the scale) is large; max-min >= 4 (one third) is uneven.
 * These deliberately simple, provisional cutoffs are not psychometrically validated.
 * More adjective selections can increase the mean or change the range. Do not
 * normalize them away: that would interpret a different shape from the graph.
 */
export const HEXAGON_BETA_RULE = { version: "beta-1", largeMean: 6, unevenRange: 4 } as const;

const FEEDBACK = {
  "large-uneven": {
    shape: "크고 불균형한 형태",
    description: "특정 분야에 대한 관심이 다른 분야보다 뚜렷하게 나타납니다.",
    exploration: "관심이 높은 유형과 관련된 활동부터 살펴보고, 기존 경력과 연결할 수 있는 일을 찾아보세요.",
  },
  "small-uneven": {
    shape: "작고 불균형한 형태",
    description: "전체 점수는 높지 않지만 상대적으로 관심이 나타나는 분야가 있습니다.",
    exploration: "관심이 나타난 활동을 작은 경험부터 시도하며 자신에게 맞는지 확인해 보세요.",
  },
  "large-balanced": {
    shape: "크고 균형 잡힌 형태",
    description: "여러 분야에 대한 관심이 고르게 높게 나타납니다.",
    exploration: "지금까지의 경험과 근무조건을 고려하여 우선 탐색할 분야를 정해 보세요.",
  },
  "small-balanced": {
    shape: "작고 균형 잡힌 형태",
    description: "현재 검사에서는 특별히 두드러지는 흥미 분야가 나타나지 않았습니다.",
    exploration: "과거 업무에서 보람을 느꼈던 순간과 앞으로 해 보고 싶은 활동을 떠올려 보세요.",
  },
} as const;

/** Pure, deterministic interpretation; never changes scores or ranks. */
export function classifyHexagon(scores: Readonly<Record<RiasecType, number>>) {
  const values = RIASEC_ORDER.map((type) => scores[type]);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 12)) {
    throw new RangeError("육각 모형 해석에는 6개 유형의 0~12점 정수가 필요합니다.");
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / 6;
  const range = Math.max(...values) - Math.min(...values);
  const key = `${mean >= HEXAGON_BETA_RULE.largeMean ? "large" : "small"}-${range >= HEXAGON_BETA_RULE.unevenRange ? "uneven" : "balanced"}` as keyof typeof FEEDBACK;
  return { key, ...FEEDBACK[key], mean, range, ruleVersion: HEXAGON_BETA_RULE.version };
}
