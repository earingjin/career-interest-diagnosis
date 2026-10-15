import "server-only";
import combinedInterpretations from "../../content/combined-interpretations.server";
import interpretations from "../../content/interpretations.server";
import type { Db } from "../session/db";
import { buildResultView, ResultViewError, type ResultView } from "./view";

export type SessionResultOutcome =
  /** 해당 ID 의 세션이 없다. */
  | { kind: "not_found" }
  /** 아직 제출하지 않았다. */
  | { kind: "in_progress" }
  /** 제출 상태인데 results 행이 없다 (확인 필요). */
  | { kind: "missing_result" }
  /** 저장된 결과가 점수와 맞지 않는 등 화면을 만들 수 없다 (확인 필요). */
  | { kind: "invalid_result"; message: string }
  | { kind: "ok"; view: ResultView };

type Joined<T> = T | T[] | null;
const one = <T>(value: Joined<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

/**
 * 세션 ID 로 저장된 결과를 읽어 화면용 뷰 모델로 만든다 (읽기 전용).
 * 고객 결과 화면과 관리자 결과 상세가 같은 함수를 쓰므로 두 화면의 데이터는 항상 같다.
 * 호출하는 쪽이 접근 권한(고객 쿠키 또는 관리자 인증)을 먼저 확인해야 한다.
 */
export async function loadSessionResult(db: Db, sessionId: string): Promise<SessionResultOutcome> {
  const { data, error } = await db
    .from("sessions")
    .select(
      "id, nickname, status, submitted_at, courses(name), " +
        "results(scoring_version, general_scores, adjective_scores, totals, top1, top2, job_recommendations)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`결과 조회 실패: ${error.code ?? "DB_ERROR"}`);
  if (!data) return { kind: "not_found" };

  // 컬럼을 문자열로 고른 select 라 supabase-js 가 타입을 추론하지 못한다.
  const row = data as unknown as {
    nickname: string;
    status: string;
    submitted_at: string | null;
    courses: Joined<{ name: string }>;
    results: Joined<Parameters<typeof buildResultView>[0]["result"]>;
  };

  if (row.status !== "submitted") return { kind: "in_progress" };
  const result = one(row.results);
  if (!result) return { kind: "missing_result" };
  if (!row.submitted_at || Number.isNaN(Date.parse(row.submitted_at))) {
    return { kind: "invalid_result", message: "제출 시각이 올바르지 않습니다." };
  }

  try {
    return {
      kind: "ok",
      view: buildResultView({
        result,
        nickname: row.nickname,
        courseName: one(row.courses)?.name ?? "과정 정보 없음",
        submittedAt: new Date(row.submitted_at).toISOString(),
        interpretations,
        combinedInterpretations,
      }),
    };
  } catch (error) {
    if (error instanceof ResultViewError) return { kind: "invalid_result", message: error.message };
    throw error;
  }
}
