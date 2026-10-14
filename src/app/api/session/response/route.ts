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
import { saveResponse } from "@/lib/session/responses";

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
    if (session.status === "submitted") {
      return errorResponse(409, "ALREADY_SUBMITTED", "이미 제출한 검사예요.");
    }

    const updatedAt = await saveResponse(createServerClient(), session.id, input.itemId, input.value);
    return jsonResponse({ ok: true, updatedAt });
  } catch (error) {
    console.error("[session/response]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
