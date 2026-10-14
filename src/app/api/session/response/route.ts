import { createServerClient } from "@/lib/supabase/server";
import { getCurrentSessionForCourse } from "@/lib/session/db";
import {
  FORBIDDEN_ORIGIN,
  SERVER_ERROR,
  UNAUTHORIZED,
  errorResponse,
  jsonResponse,
  readJson,
} from "@/lib/session/http";
import {
  RequestValidationError,
  isSameOriginRequest,
  parseResponseBody,
  type ResponseInput,
} from "@/lib/session/request";
import { SessionFunctionError, saveResponse } from "@/lib/session/responses";

const ALREADY_SUBMITTED = () =>
  errorResponse(409, "ALREADY_SUBMITTED", "이미 제출한 검사라서 수정할 수 없어요.");

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  let input: ResponseInput;
  try {
    input = parseResponseBody(await readJson(request));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(400, "INVALID_REQUEST", error.message);
    }
    throw error;
  }

  try {
    const session = await getCurrentSessionForCourse(input.courseCode);
    if (!session) return UNAUTHORIZED();
    // 빠른 거절용. 최종 판단은 DB 함수 save_response 가 잠금을 잡고 다시 한다.
    if (session.status === "submitted") return ALREADY_SUBMITTED();

    const updatedAt = await saveResponse(createServerClient(), session.id, input.itemId, input.value);
    return jsonResponse({ ok: true, updatedAt });
  } catch (error) {
    if (error instanceof SessionFunctionError) {
      if (error.code === "ALREADY_SUBMITTED") return ALREADY_SUBMITTED();
      if (error.code === "SESSION_NOT_FOUND") return UNAUTHORIZED();
    }
    console.error("[session/response]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
