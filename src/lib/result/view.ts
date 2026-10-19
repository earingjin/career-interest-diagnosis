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
  commonNotes: string[];
  types: Record<string, Omit<TypeInterpretation, "type"> & { type: string }>;
};

export type CombinedInterpretation = {
  /** 1순위 중심의 핵심 흥미 */
  summary: string;
  /** 1순위와 2순위 흥미의 연결 */
  explanation: string;
  /** 관심 있게 살펴볼 구체적인 활동 */
  exploration: string;
};

/** 키는 1순위 + 2순위 순서 (예: top1=C, top2=I → "CI"). */
export type CombinedInterpretationsFile = {
  combinations: Record<string, CombinedInterpretation>;
};

export type CombinedDetail = {
  /** 두 흥미가 함께 나타날 때의 모습 ("두 흥미가 만나면") */
  together: string;
  /** 지금까지의 경험과 연결해 보는 방법 ("경험에 연결해 보기") */
  connect: string;
  /** 균형 있게 살펴볼 점 ("균형 있게 살펴볼 점") */
  balance: string;
};

/** 키는 1순위 + 2순위 순서. version·reviewStatus 는 관리용이며 화면에 보이지 않는다. */
export type CombinedDetailsFile = {
  combinations: Record<string, CombinedDetail>;
};

export type ResultGroup = {
  id: "interest" | "activity" | "career" | "jobs";
  title: string;
  items: { label: string; text: string }[];
};

export type ResultTypeSection = {
  type: RiasecType;
  nameKo: string;
  nameEn: string;
  subtitle: string;
  keywords: string;
  groups: ResultGroup[];
  jobs: string[];
  jobsTruncated?: boolean;
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
  /** 이 결과의 1·2순위 조합 하나에 대한 종합 해석. 다른 조합의 문안은 담지 않는다. */
  combinedInterpretation: CombinedInterpretation;
  /** 이 결과의 1·2순위 조합 하나에 대한 상세 해석. 다른 조합의 문안은 담지 않는다. */
  combinedDetail: CombinedDetail;
  /** 1·2순위에 공통으로 적용되는 안내. 결과 전체에 한 번만 표시한다. */
  commonNotes: string[];
};

export type BuildResultViewInput = {
  result: ResultRow;
  nickname: string;
  courseName: string;
  submittedAt: string;
  interpretations: InterpretationsFile;
  combinedInterpretations: CombinedInterpretationsFile;
  combinedDetails: CombinedDetailsFile;
};

// 화면과 관리자 출력에 같은 값을 전달한다. 두 순위에 공통인 안내는 영역에 넣지 않고 commonNotes 로 한 번만 전달한다.
// "jobs" 영역은 추천직업 목록 다음에 확인사항을 보여준다.
const GROUP_DEFINITIONS = [
  {
    id: "interest", title: "나의 직업흥미 특성",
    items: [["핵심흥미", "interest"], ["업무방식", "workStyle"]],
  },
  {
    id: "activity", title: "선호하는 활동과 업무 환경",
    items: [["선호활동", "preferredActivity"], ["업무환경", "workEnvironment"], ["부담활동", "burdensomeActivity"]],
  },
  {
    id: "career", title: "경력 활용과 진로 탐색",
    items: [["경험활용", "careerUse"], ["탐색방향", "careerExplore"]],
  },
  {
    id: "jobs", title: "추천직업과 확인사항",
    items: [["확인사항", "careerCheck"]],
  },
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

function readJobs(value: unknown, type: RiasecType): Pick<ResultTypeSection, "jobs" | "jobsTruncated"> {
  if (!Array.isArray(value)) throw new ResultViewError("job_recommendations 형식이 올바르지 않습니다.");
  const entry = value.find((item) => typeof item === "object" && item !== null && item.type === type);
  if (!entry || !Array.isArray(entry.jobs) || entry.jobs.some((job: unknown) => typeof job !== "string")) {
    throw new ResultViewError(`${type} 유형의 추천직업이 없거나 형식이 올바르지 않습니다.`);
  }
  const jobs: string[] = entry.jobs;
  if (entry.count !== undefined && entry.count !== jobs.length) {
    throw new ResultViewError(`${type} 유형의 추천직업 개수(count)가 목록과 다릅니다.`);
  }
  return { jobs, jobsTruncated: entry.hasMore === true };
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
    keywords: interpretation.keywords.join(" · "),
    groups: GROUP_DEFINITIONS.map((group) => ({
      id: group.id,
      title: group.title,
      items: group.items.map(([label, field]) => ({ label, text: interpretation[field] })),
    })),
    ...readJobs(jobRecommendations, type),
  };
}

/** 1·2순위 조합의 종합 해석 세 문장만 꺼낸다. 없거나 비어 있으면 임의의 문안 대신 오류로 처리한다. */
function readCombined(top1: RiasecType, top2: RiasecType, file: CombinedInterpretationsFile): CombinedInterpretation {
  const key = `${top1}${top2}`;
  const entry: Partial<CombinedInterpretation> | undefined = Object.hasOwn(file.combinations, key) ? file.combinations[key] : undefined;
  const { summary, explanation, exploration } = entry ?? {};
  for (const text of [summary, explanation, exploration]) {
    if (typeof text !== "string" || text.trim() === "") {
      throw new ResultViewError(`${key} 조합의 종합 해석이 없거나 비어 있습니다.`);
    }
  }
  return { summary: summary!, explanation: explanation!, exploration: exploration! };
}

/** 1·2순위 조합의 상세 해석 세 항목만 꺼낸다. 없거나 비어 있으면 readCombined 와 같이 오류로 처리한다. */
function readDetail(top1: RiasecType, top2: RiasecType, file: CombinedDetailsFile): CombinedDetail {
  const key = `${top1}${top2}`;
  const entry: Partial<CombinedDetail> | undefined = Object.hasOwn(file.combinations, key) ? file.combinations[key] : undefined;
  const { together, connect, balance } = entry ?? {};
  for (const text of [together, connect, balance]) {
    if (typeof text !== "string" || text.trim() === "") {
      throw new ResultViewError(`${key} 조합의 상세 해석이 없거나 비어 있습니다.`);
    }
  }
  return { together: together!, connect: connect!, balance: balance! };
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
  combinedInterpretations,
  combinedDetails,
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
    combinedInterpretation: readCombined(top1, top2, combinedInterpretations),
    combinedDetail: readDetail(top1, top2, combinedDetails),
    commonNotes: [...interpretations.commonNotes],
  };
}
