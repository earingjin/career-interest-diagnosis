import { RIASEC_ORDER, type RiasecType, type TypeInterpretation } from "../../content/types";

// 결과 화면에 필요한 값만 뽑은 읽기 전용 뷰 모델.
// sessionId, 토큰, 휴대폰 관련 값, 원본 results 행은 담지 않는다.

export class ResultViewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResultViewError";
  }
}

/** results 테이블 행 중 화면에 쓰는 컬럼 (jsonb 컬럼은 검증 전이라 unknown). */
export type ResultRow = {
  scoring_version: string;
  general_scores: unknown;
  adjective_scores: unknown;
  totals: unknown;
  top1: string;
  top2: string;
  job_recommendations: unknown;
};

export type InterpretationsFile = {
  types: Record<string, Omit<TypeInterpretation, "type"> & { type: string }>;
};

export type ResultGroup = {
  title: string;
  items: { label: string; text: string }[];
};

export type ResultTypeSection = {
  type: RiasecType;
  nameKo: string;
  nameEn: string;
  subtitle: string;
  groups: ResultGroup[];
  jobs: string[];
};

export type ResultTotalRow = {
  type: RiasecType;
  nameKo: string;
  total: number;
  general: number;
  adjective: number;
  emphasized: boolean;
};

export type ResultView = {
  nickname: string;
  courseName: string;
  submittedAt: string;
  scoringVersion: string;
  top1: ResultTypeSection;
  top2: ResultTypeSection;
  totals: ResultTotalRow[];
};

export type BuildResultViewInput = {
  result: ResultRow;
  nickname: string;
  courseName: string;
  submittedAt: string;
  interpretations: InterpretationsFile;
};

// 묶음 4개와 라벨 8개. 순서와 이름이 고정이다.
const GROUP_DEFINITIONS = [
  { title: "나의 흥미", items: [["흥미특성", "interest"], ["가치", "value"]] },
  { title: "나의 활동", items: [["선호활동", "preferredActivity"], ["회피활동", "avoidedActivity"]] },
  { title: "나의 역량", items: [["적성", "aptitude"], ["자기평가", "selfEvaluation"]] },
  { title: "나의 성향", items: [["성격", "personality"], ["타인평가", "othersEvaluation"]] },
] as const;

function isRiasecType(value: unknown): value is RiasecType {
  return typeof value === "string" && (RIASEC_ORDER as readonly string[]).includes(value);
}

function readScores(value: unknown, name: string): Record<RiasecType, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ResultViewError(`${name} 형식이 올바르지 않습니다.`);
  }
  const scores = {} as Record<RiasecType, number>;
  for (const type of RIASEC_ORDER) {
    const score = (value as Record<string, unknown>)[type];
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
      throw new ResultViewError(`${name} 의 ${type} 점수가 올바르지 않습니다.`);
    }
    scores[type] = score;
  }
  return scores;
}

function readJobs(value: unknown, type: RiasecType): string[] {
  if (!Array.isArray(value)) throw new ResultViewError("job_recommendations 형식이 올바르지 않습니다.");
  const entry = value.find((item) => typeof item === "object" && item !== null && item.type === type);
  if (!entry || !Array.isArray(entry.jobs) || entry.jobs.some((job: unknown) => typeof job !== "string")) {
    throw new ResultViewError(`${type} 유형의 추천직업이 없거나 형식이 올바르지 않습니다.`);
  }
  const jobs: string[] = entry.jobs;
  if (entry.count !== undefined && entry.count !== jobs.length) {
    throw new ResultViewError(`${type} 유형의 추천직업 개수(count)가 목록과 다릅니다.`);
  }
  return jobs;
}

function buildSection(
  type: RiasecType,
  interpretations: InterpretationsFile,
  jobRecommendations: unknown,
): ResultTypeSection {
  const interpretation = interpretations.types[type];
  if (!interpretation) throw new ResultViewError(`${type} 유형의 해설이 없습니다.`);

  return {
    type,
    nameKo: interpretation.nameKo,
    nameEn: interpretation.nameEn,
    subtitle: interpretation.subtitle,
    groups: GROUP_DEFINITIONS.map((group) => ({
      title: group.title,
      items: group.items.map(([label, field]) => ({ label, text: interpretation[field] })),
    })),
    jobs: readJobs(jobRecommendations, type),
  };
}

/**
 * 저장된 results 행으로 결과 화면용 뷰 모델을 만든다.
 * 1·2순위는 저장된 값을 그대로 쓰되, 점수와 맞는지(동점이면 RIASEC 순서) 검증만 한다.
 */
export function buildResultView({
  result,
  nickname,
  courseName,
  submittedAt,
  interpretations,
}: BuildResultViewInput): ResultView {
  if (!isRiasecType(result.top1) || !isRiasecType(result.top2) || result.top1 === result.top2) {
    throw new ResultViewError("1순위와 2순위 유형이 올바르지 않습니다.");
  }
  const { top1, top2 } = result;

  const general = readScores(result.general_scores, "general_scores");
  const adjective = readScores(result.adjective_scores, "adjective_scores");
  const totals = readScores(result.totals, "totals");
  for (const type of RIASEC_ORDER) {
    if (totals[type] !== general[type] + adjective[type]) {
      throw new ResultViewError(`${type} 유형의 합계가 일반성향·형용사 점수의 합과 다릅니다.`);
    }
  }

  // 점수가 높은 순, 같으면 RIASEC 순서에서 앞선 유형 (정렬은 안정 정렬)
  const ranked = [...RIASEC_ORDER].sort((a, b) => totals[b] - totals[a]);
  if (ranked[0] !== top1 || ranked[1] !== top2) {
    throw new ResultViewError("저장된 1·2순위가 점수와 맞지 않습니다.");
  }

  return {
    nickname,
    courseName,
    submittedAt,
    scoringVersion: result.scoring_version,
    top1: buildSection(top1, interpretations, result.job_recommendations),
    top2: buildSection(top2, interpretations, result.job_recommendations),
    totals: RIASEC_ORDER.map((type) => ({
      type,
      nameKo: interpretations.types[type]?.nameKo ?? type,
      total: totals[type],
      general: general[type],
      adjective: adjective[type],
      emphasized: type === top1 || type === top2,
    })),
  };
}
