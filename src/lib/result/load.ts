import "server-only";
import { createServerClient } from "../supabase/server";
import { getCurrentSessionForCourse } from "../session/db";
import { loadSessionResult } from "./sessionResult";
import { ResultViewError, type ResultView } from "./view";

export type LoadResultOutcome =
  /** 쿠키 세션이 없거나 이 과정의 세션이 아니다. */
  | { kind: "no_session" }
  /** 아직 제출하지 않았다. 검사 화면으로 보낸다. */
  | { kind: "in_progress" }
  | { kind: "ok"; view: ResultView };

/**
 * 쿠키 세션으로 제출된 결과를 읽어 화면용 뷰 모델로 만든다 (읽기 전용).
 * 결과를 JSON API 로 노출하지 않고, 이 함수를 쓰는 결과 페이지만 데이터를 받는다.
 * 결과 내용은 관리자 결과 상세와 같은 함수(loadSessionResult)로 만든다.
 */
export async function loadResult(courseCode: string): Promise<LoadResultOutcome> {
  // 쿠키 토큰으로 세션을 찾고, URL 의 과정 코드와 다르면 세션이 없는 것으로 본다.
  const session = await getCurrentSessionForCourse(courseCode);
  if (!session) return { kind: "no_session" };
  if (session.status !== "submitted") return { kind: "in_progress" };

  const outcome = await loadSessionResult(createServerClient(), session.id);
  switch (outcome.kind) {
    case "ok":
      return { kind: "ok", view: outcome.view };
    case "in_progress":
      return { kind: "in_progress" };
    case "not_found":
      return { kind: "no_session" };
    case "missing_result":
      throw new Error("제출된 세션에 결과 행이 없습니다.");
    case "invalid_result":
      throw new ResultViewError(outcome.message);
  }
}
