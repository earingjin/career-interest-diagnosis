import { createServerClient } from "@/lib/supabase/server";
import { dbError, getCurrentSession } from "@/lib/session/db";
import {
  FORBIDDEN_ORIGIN,
  SERVER_ERROR,
  UNAUTHORIZED,
  errorResponse,
  jsonResponse,
  readJson,
} from "@/lib/session/http";
import { RequestValidationError, isSameOriginRequest, parseStepBody } from "@/lib/session/request";

const ALREADY_SUBMITTED = () => errorResponse(409, "ALREADY_SUBMITTED", "이미 제출한 검사예요.");

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  let step: string;
  try {
    step = parseStepBody(await readJson(request));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(400, "INVALID_STEP", error.message);
    }
    throw error;
  }

  try {
    const session = await getCurrentSession();
    if (!session) return UNAUTHORIZED();
    if (session.status === "submitted") return ALREADY_SUBMITTED();

    // 조회 이후 제출된 경우를 막기 위해 in_progress 일 때만 갱신한다.
    const { data, error } = await createServerClient()
      .from("sessions")
      .update({ current_step: step })
      .eq("id", session.id)
      .eq("status", "in_progress")
      .select("id");
    if (error) throw dbError("current_step 갱신", error);
    if (!data || data.length === 0) return ALREADY_SUBMITTED();

    return jsonResponse({ currentStep: step });
  } catch (error) {
    console.error("[session/step]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
