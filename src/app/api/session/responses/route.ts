import { createServerClient } from "@/lib/supabase/server";
import { readSessionToken } from "@/lib/session/cookie";
import { findSessionByToken } from "@/lib/session/db";
import { SERVER_ERROR, UNAUTHORIZED, errorResponse, jsonResponse } from "@/lib/session/http";
import { resolveResumeStep } from "@/lib/session/progress";
import { RequestValidationError, parseCourseCode } from "@/lib/session/request";
import { getResponsesSnapshot } from "@/lib/session/responses";

// 읽기 전용이라 same-origin 검사는 하지 않는다. 과정 코드는 ?courseCode= 로 받는다.
export async function GET(request: Request) {
  // 요청 시점 API 는 try/catch 밖에서 읽는다 (프리렌더링 중단 신호를 삼키지 않기 위해).
  const token = await readSessionToken();

  let courseCode: string;
  try {
    courseCode = parseCourseCode(new URL(request.url).searchParams.get("courseCode"));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(400, "INVALID_REQUEST", error.message);
    }
    throw error;
  }
  if (!token) return UNAUTHORIZED();

  try {
    const db = createServerClient();
    const session = await findSessionByToken(db, token);
    if (!session || session.courseCode !== courseCode) return UNAUTHORIZED();

    const { general, adjectives } = await getResponsesSnapshot(db, session.id);
    return jsonResponse({
      status: session.status,
      // 오프라인 등으로 DB 의 current_step 이 뒤처졌을 수 있어 응답 기록으로 보정한다 (DB 는 바꾸지 않는다).
      currentStep: resolveResumeStep(session.currentStep, new Set(Object.keys(general))),
      general,
      adjectives,
    });
  } catch (error) {
    console.error("[session/responses]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
