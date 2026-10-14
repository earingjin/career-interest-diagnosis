import { createServerClient } from "@/lib/supabase/server";
import { dbError, getCurrentSessionForCourse } from "@/lib/session/db";
import {
  FORBIDDEN_ORIGIN,
  SERVER_ERROR,
  UNAUTHORIZED,
  errorResponse,
  jsonResponse,
  readJson,
} from "@/lib/session/http";
import { generalNumber, isStepReachable, GENERAL_COUNT } from "@/lib/session/progress";
import {
  RequestValidationError,
  isSameOriginRequest,
  parseCourseCodeField,
  parseStepBody,
} from "@/lib/session/request";
import { countProgress } from "@/lib/session/responses";

const ALREADY_SUBMITTED = () => errorResponse(409, "ALREADY_SUBMITTED", "이미 제출한 검사예요.");

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  let courseCode: string;
  let step: string;
  try {
    const body = await readJson(request);
    courseCode = parseCourseCodeField(body);
    step = parseStepBody(body);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(400, "INVALID_STEP", error.message);
    }
    throw error;
  }

  try {
    const session = await getCurrentSessionForCourse(courseCode);
    if (!session) return UNAUTHORIZED();
    if (session.status === "submitted") return ALREADY_SUBMITTED();

    const db = createServerClient();

    // general-N 은 항상 갈 수 있으므로 개수를 셀 필요가 없다.
    if (generalNumber(step) === null) {
      const counts = await countProgress(db, session.id);
      if (!isStepReachable(step, counts)) {
        const message =
          counts.answeredGeneralCount < GENERAL_COUNT
            ? "아직 응답하지 않은 문항이 있어요"
            : "형용사를 5개 이상 골라야 해요";
        return errorResponse(409, "STEP_NOT_REACHABLE", message);
      }
    }

    // 조회 이후 제출된 경우를 막기 위해 in_progress 일 때만 갱신한다.
    const { data, error } = await db
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
