import questions from "../../content/questions.json";
import interpretations from "../../content/interpretations.json";
import {
  RIASEC_ORDER,
  type AdjectiveItem,
  type GeneralQuestion,
  type RiasecType,
  type TypeInterpretation,
} from "../../content/types";
import { SCORING_VERSION } from "./version";

export { RIASEC_ORDER };
export type { RiasecType };

// 키는 "g01"~"g42", 값은 true=예 / false=아니요
export type GeneralAnswers = Record<string, boolean>;
// 선택한 "a01"~"a30" 의 배열, 중복 없음
export type AdjectiveSelections = string[];

export type JobRecommendation = {
  type: RiasecType;
  jobs: string[];
  // 실제로 뽑힌 개수. 목록이 부족하면 JOBS_PER_TYPE 보다 작다.
  count: number;
};

export type ScoreResult = {
  scoringVersion: string;
  generalScores: Record<RiasecType, number>; // 0~7
  adjectiveScores: Record<RiasecType, number>; // 0~5
  totals: Record<RiasecType, number>; // 0~12
  top1: RiasecType;
  top2: RiasecType;
  tieBroken: boolean;
  jobRecommendations: JobRecommendation[]; // 1순위, 2순위 순서
};

export type JobSource = Pick<TypeInterpretation, "seniorJobs" | "generalJobs">;

export const MIN_ADJECTIVES = 5;
export const JOBS_PER_TYPE = 5;

export class SubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionError";
  }
}

const GENERAL_QUESTIONS = questions.general as GeneralQuestion[];
const ADJECTIVE_ITEMS = questions.adjectives as AdjectiveItem[];
const TYPE_INTERPRETATIONS = interpretations.types as Record<RiasecType, TypeInterpretation>;

const GENERAL_TYPE_BY_ID = new Map(GENERAL_QUESTIONS.map((q) => [q.id, q.type]));
const ADJECTIVE_TYPE_BY_ID = new Map(ADJECTIVE_ITEMS.map((a) => [a.id, a.type]));

function zeroScores(): Record<RiasecType, number> {
  return { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
}

/**
 * 제출 내용을 검증한다. 어긋나면 SubmissionError 를 던진다.
 *
 * 이 검증은 최종 제출 시에만 호출한다. 응답 도중의 임시 저장에는 쓰지 않는다
 * (진행 중에는 문항이 비어 있거나 형용사가 5개 미만인 것이 정상이다).
 */
export function validateSubmission(general: GeneralAnswers, adjectives: AdjectiveSelections): void {
  if (typeof general !== "object" || general === null || Array.isArray(general)) {
    throw new SubmissionError("일반성향 응답 형식이 올바르지 않습니다.");
  }

  const unknownKeys = Object.keys(general).filter((key) => !GENERAL_TYPE_BY_ID.has(key));
  if (unknownKeys.length > 0) {
    throw new SubmissionError(`알 수 없는 일반성향 문항이 있습니다: ${unknownKeys.join(", ")}`);
  }

  const missing = GENERAL_QUESTIONS.map((q) => q.id).filter((id) => !Object.hasOwn(general, id));
  if (missing.length > 0) {
    throw new SubmissionError(`응답하지 않은 일반성향 문항이 있습니다: ${missing.join(", ")}`);
  }

  const notBoolean = Object.keys(general).filter((key) => typeof general[key] !== "boolean");
  if (notBoolean.length > 0) {
    throw new SubmissionError(`일반성향 응답 값은 예/아니요여야 합니다: ${notBoolean.join(", ")}`);
  }

  if (!Array.isArray(adjectives)) {
    throw new SubmissionError("형용사 선택 형식이 올바르지 않습니다.");
  }

  const unknownAdjectives = adjectives.filter((id) => typeof id !== "string" || !ADJECTIVE_TYPE_BY_ID.has(id));
  if (unknownAdjectives.length > 0) {
    throw new SubmissionError(`알 수 없는 형용사 항목이 있습니다: ${unknownAdjectives.map(String).join(", ")}`);
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of adjectives) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    throw new SubmissionError(`형용사 항목이 중복 선택되었습니다: ${[...duplicates].join(", ")}`);
  }

  if (adjectives.length < MIN_ADJECTIVES) {
    throw new SubmissionError(
      `형용사는 ${MIN_ADJECTIVES}개 이상 선택해야 합니다 (현재 ${adjectives.length}개).`,
    );
  }
}

/**
 * 1순위 유형부터 유형당 최대 JOBS_PER_TYPE 개의 추천직업을 뽑는다.
 * 고령자 목록(seniorJobs)을 먼저, 부족하면 일반성인 목록(generalJobs)을 원래 순서대로 쓴다.
 * 이미 뽑힌 이름은 (두 유형 전체에 걸쳐) 건너뛴다. 목록이 부족하면 채운 만큼만 돌려준다.
 */
export function selectJobs(
  top1: RiasecType,
  top2: RiasecType,
  source: Record<RiasecType, JobSource> = TYPE_INTERPRETATIONS,
): JobRecommendation[] {
  const used = new Set<string>();

  return [top1, top2].map((type) => {
    const jobs: string[] = [];
    for (const raw of [...source[type].seniorJobs, ...source[type].generalJobs]) {
      if (jobs.length >= JOBS_PER_TYPE) break;
      const name = raw.trim();
      if (name === "" || used.has(name)) continue;
      used.add(name);
      jobs.push(name);
    }
    return { type, jobs, count: jobs.length };
  });
}

function rank(totals: Record<RiasecType, number>): RiasecType[] {
  // Array.prototype.sort 는 안정 정렬이므로 동점이면 RIASEC_ORDER 순서가 유지된다.
  return [...RIASEC_ORDER].sort((a, b) => totals[b] - totals[a]);
}

/**
 * 응답으로 결과를 계산한다. 입력은 이 함수 안에서도 다시 검증한다.
 */
export function calculateScores(general: GeneralAnswers, adjectives: AdjectiveSelections): ScoreResult {
  validateSubmission(general, adjectives);

  const generalScores = zeroScores();
  for (const q of GENERAL_QUESTIONS) {
    if (general[q.id] === true) generalScores[q.type] += 1;
  }

  const adjectiveScores = zeroScores();
  for (const id of adjectives) {
    adjectiveScores[ADJECTIVE_TYPE_BY_ID.get(id)!] += 1;
  }

  const totals = zeroScores();
  for (const t of RIASEC_ORDER) totals[t] = generalScores[t] + adjectiveScores[t];

  const [top1, top2, third] = rank(totals);
  const tieBroken = totals[top1] === totals[top2] || totals[top2] === totals[third];

  return {
    scoringVersion: SCORING_VERSION,
    generalScores,
    adjectiveScores,
    totals,
    top1,
    top2,
    tieBroken,
    jobRecommendations: selectJobs(top1, top2),
  };
}
