// 서버와 클라이언트가 함께 쓰는 순수 함수. 서버 전용 모듈을 import 하지 않는다.

export const GENERAL_COUNT = 42;
export const MIN_ADJECTIVE_SELECTIONS = 5;

export const STEP_ORDER: readonly string[] = [
  ...Array.from({ length: GENERAL_COUNT }, (_, i) => `general-${i + 1}`),
  "part1-done",
  "adjectives-intro",
  "adjectives",
  "review",
];

const STEP_INDEX = new Map(STEP_ORDER.map((step, index) => [step, index]));

export type ProgressCounts = {
  answeredGeneralCount: number;
  selectedAdjectiveCount: number;
};

export function isKnownStep(step: string): boolean {
  return STEP_INDEX.has(step);
}

/** 1~42 번 일반성향 문항의 id. 1 → "g01" */
export function generalItemId(n: number): string {
  return `g${String(n).padStart(2, "0")}`;
}

/** "general-N" 이면 N, 아니면 null */
export function generalNumber(step: string): number | null {
  const match = /^general-([1-9][0-9]?)$/.exec(step);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= GENERAL_COUNT ? n : null;
}

export function nextStep(step: string): string | null {
  const index = STEP_INDEX.get(step);
  if (index === undefined) return null;
  return STEP_ORDER[index + 1] ?? null;
}

export function prevStep(step: string): string | null {
  const index = STEP_INDEX.get(step);
  if (index === undefined || index === 0) return null;
  return STEP_ORDER[index - 1];
}

/** 응답하지 않은 첫 일반성향 문항의 단계. 42개 모두 응답했으면 null. */
export function firstUnansweredGeneral(answeredIds: Set<string>): string | null {
  for (let n = 1; n <= GENERAL_COUNT; n++) {
    if (!answeredIds.has(generalItemId(n))) return `general-${n}`;
  }
  return null;
}

/**
 * 응답 개수로 볼 때 그 단계로 갈 수 있는지.
 * 서버(step 라우트)와 화면이 같은 규칙을 쓴다. 서버에서는 직접 센 값을 넘긴다.
 */
export function isStepReachable(step: string, counts: ProgressCounts): boolean {
  if (!STEP_INDEX.has(step)) return false;
  if (generalNumber(step) !== null) return true;

  const generalDone = counts.answeredGeneralCount >= GENERAL_COUNT;
  switch (step) {
    case "part1-done":
    case "adjectives-intro":
    case "adjectives":
      return generalDone;
    case "review":
      return generalDone && counts.selectedAdjectiveCount >= MIN_ADJECTIVE_SELECTIONS;
    default:
      return false;
  }
}

/**
 * 재접속 시 보여줄 위치. DB 의 current_step 은 오프라인 등으로 뒤처질 수 있으므로
 * 응답 기록을 기준으로 보정한다 (읽기 전용: DB 값은 바꾸지 않는다).
 * - general-N 이고 미응답 문항이 있으면 첫 미응답 문항
 * - general-N 이고 42개를 모두 응답했으면 part1-done
 * - 그 밖의 단계는 그대로
 */
export function resolveResumeStep(currentStep: string, answeredGeneralIds: Set<string>): string {
  if (generalNumber(currentStep) === null) return currentStep;
  return firstUnansweredGeneral(answeredGeneralIds) ?? "part1-done";
}
