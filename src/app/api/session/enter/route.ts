import { generateSessionToken, getHashSecret, phoneKey, sha256Hex } from "@/lib/security/hash";
import { createServerClient } from "@/lib/supabase/server";
import { readSessionToken, setSessionCookie } from "@/lib/session/cookie";
import { dbError, findCourseByCode, findSessionByIdentity } from "@/lib/session/db";
import { decideEntry } from "@/lib/session/entry";
import { FORBIDDEN_ORIGIN, SERVER_ERROR, errorResponse, jsonResponse, readJson } from "@/lib/session/http";
import { RequestValidationError, isSameOriginRequest, parseEnterBody, type EnterInput } from "@/lib/session/request";

const UNIQUE_VIOLATION = "23505";
// 동시에 같은 사람이 요청해 경합이 생겼을 때 다시 판단하는 최대 횟수
const MAX_ATTEMPTS = 3;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  let input: EnterInput;
  try {
    input = parseEnterBody(await readJson(request));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(400, "INVALID_REQUEST", error.message);
    }
    throw error;
  }

  try {
    return await enter(input);
  } catch (error) {
    // 비밀 값이 섞이지 않도록 메시지만 남긴다.
    console.error("[session/enter]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}

async function enter({ courseCode, nickname, phoneLast4 }: EnterInput): Promise<Response> {
  const db = createServerClient();

  const course = await findCourseByCode(db, courseCode);
  if (!course) return errorResponse(404, "COURSE_NOT_FOUND", "과정 정보를 찾을 수 없어요");

  const key = phoneKey(getHashSecret(), phoneLast4);
  const cookieToken = await readSessionToken();
  const cookieTokenHash = cookieToken ? sha256Hex(cookieToken) : null;

  const testPath = `/c/${course.code}/test`;
  const resultPath = `/c/${course.code}/result`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await findSessionByIdentity(db, course.id, nickname, key);
    const action = decideEntry(existing, cookieTokenHash);

    switch (action) {
      case "create": {
        const token = generateSessionToken();
        const { error } = await db.from("sessions").insert({
          course_id: course.id,
          nickname,
          phone_key: key,
          token_hash: sha256Hex(token),
          status: "in_progress",
          current_step: "general-1",
        });
        if (error) {
          // 같은 사람이 동시에 만든 경우: 다시 조회해 판단한다.
          if (error.code === UNIQUE_VIOLATION) continue;
          throw dbError("sessions 생성", error);
        }
        await setSessionCookie(token);
        return jsonResponse({ next: testPath });
      }

      case "takeover": {
        const token = generateSessionToken();
        // 조회 이후 상태가 바뀌지 않았을 때만 갱신한다 (제출·다른 기기의 takeover 와의 경합 방지).
        const { data, error } = await db
          .from("sessions")
          .update({ token_hash: sha256Hex(token) })
          .eq("id", existing!.id)
          .eq("token_hash", existing!.tokenHash)
          .eq("status", "in_progress")
          .select("id");
        if (error) throw dbError("sessions 토큰 갱신", error);
        if (!data || data.length === 0) continue;
        await setSessionCookie(token);
        return jsonResponse({ next: testPath });
      }

      case "resume":
        return jsonResponse({ next: testPath });

      case "show_result":
        return jsonResponse({ next: resultPath });

      case "already_submitted":
        return errorResponse(
          409,
          "ALREADY_SUBMITTED",
          "이미 제출한 검사입니다. 처음 검사한 휴대폰에서 결과를 확인하거나 강사님께 문의해 주세요.",
        );
    }
  }

  return errorResponse(409, "CONFLICT", "요청이 겹쳤어요. 잠시 후 다시 시도해 주세요.");
}
