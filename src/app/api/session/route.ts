import { createServerClient } from "@/lib/supabase/server";
import { readSessionToken } from "@/lib/session/cookie";
import { findSessionByToken } from "@/lib/session/db";
import { SERVER_ERROR, UNAUTHORIZED, jsonResponse } from "@/lib/session/http";

// 읽기 전용이라 same-origin 검사는 하지 않는다. 민감한 값은 돌려주지 않는다.
export async function GET() {
  // 요청 시점 API 는 try/catch 밖에서 읽는다 (프리렌더링 중단 신호를 삼키지 않기 위해).
  const token = await readSessionToken();
  if (!token) return UNAUTHORIZED();

  try {
    const session = await findSessionByToken(createServerClient(), token);
    if (!session) return UNAUTHORIZED();
    return jsonResponse({
      status: session.status,
      currentStep: session.currentStep,
      courseName: session.courseName,
    });
  } catch (error) {
    console.error("[session GET]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
