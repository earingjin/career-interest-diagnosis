import { SubmissionError, calculateScores, validateSubmission } from "@/lib/scoring/score";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentSessionForCourse } from "@/lib/session/db";
import { responseFingerprint } from "@/lib/session/fingerprint";
import {
  FORBIDDEN_ORIGIN,
  SERVER_ERROR,
  UNAUTHORIZED,
  errorResponse,
  jsonResponse,
  readJson,
} from "@/lib/session/http";
import { GENERAL_COUNT, MIN_ADJECTIVE_SELECTIONS, generalItemId } from "@/lib/session/progress";
import { RequestValidationError, isSameOriginRequest, parseCourseCodeField } from "@/lib/session/request";
import {
  SessionFunctionError,
  readResponseRows,
  submitSessionResult,
  type ResponseRow,
} from "@/lib/session/responses";

// 처음 1번 + RESPONSES_CHANGED 일 때 최대 2번 다시 시도
const MAX_ATTEMPTS = 3;
const MAX_LISTED_MISSING = 10;

const ALREADY_SUBMITTED = () => errorResponse(409, "ALREADY_SUBMITTED", "이미 제출한 검사예요.");
const RESPONSES_CHANGED = () =>
  errorResponse(409, "RESPONSES_CHANGED", "응답이 바뀌었어요. 다시 제출해 주세요.");
const GENERAL_INCOMPLETE = (message = "아직 응답하지 않은 문항이 있어요.") =>
  errorResponse(400, "GENERAL_INCOMPLETE", message);
const ADJECTIVES_INSUFFICIENT = (message = `형용사를 ${MIN_ADJECTIVE_SELECTIONS}개 이상 골라야 해요.`) =>
  errorResponse(400, "ADJECTIVES_INSUFFICIENT", message);

type Outcome = { kind: "ok" } | { kind: "response"; response: Response };

/** 응답을 읽어 결과를 계산하고 DB 함수로 제출한다. 응답이 바뀌었으면 RESPONSES_CHANGED 를 던진다. */
async function trySubmit(db: ReturnType<typeof createServerClient>, sessionId: string): Promise<Outcome> {
  const rows: ResponseRow[] = await readResponseRows(db, sessionId);

  const general: Record<string, boolean> = {};
  const adjectives: string[] = [];
  for (const row of rows) {
    if (row.itemId.startsWith("g")) general[row.itemId] = row.value;
    else if (row.value) adjectives.push(row.itemId);
  }

  // 사용자에게 보여줄 안내는 여기서 만든다 (미응답 번호는 최대 10개까지).
  const missing: number[] = [];
  for (let n = 1; n <= GENERAL_COUNT; n++) if (!(generalItemId(n) in general)) missing.push(n);
  if (missing.length > 0) {
    const listed = missing.slice(0, MAX_LISTED_MISSING).join(", ");
    const more = missing.length > MAX_LISTED_MISSING ? ` 외 ${missing.length - MAX_LISTED_MISSING}개` : "";
    return {
      kind: "response",
      response: GENERAL_INCOMPLETE(`아직 응답하지 않은 문항이 있어요: ${listed}번${more}`),
    };
  }
  if (adjectives.length < MIN_ADJECTIVE_SELECTIONS) {
    return {
      kind: "response",
      response: ADJECTIVES_INSUFFICIENT(
        `형용사를 ${MIN_ADJECTIVE_SELECTIONS - adjectives.length}개 더 골라야 제출할 수 있어요.`,
      ),
    };
  }

  // 채점 모듈의 제출 검증을 그대로 쓴다 (calculateScores 안에서도 한 번 더 검증한다).
  validateSubmission(general, adjectives);
  const score = calculateScores(general, adjectives);

  await submitSessionResult(db, sessionId, responseFingerprint(rows), {
    scoringVersion: score.scoringVersion,
    generalScores: score.generalScores,
    adjectiveScores: score.adjectiveScores,
    totals: score.totals,
    top1: score.top1,
    top2: score.top2,
    tieBroken: score.tieBroken,
    jobRecommendations: score.jobRecommendations,
  });
  return { kind: "ok" };
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  let courseCode: string;
  try {
    courseCode = parseCourseCodeField(await readJson(request));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(400, "INVALID_REQUEST", error.message);
    }
    throw error;
  }

  try {
    const session = await getCurrentSessionForCourse(courseCode);
    if (!session) return UNAUTHORIZED();
    if (session.status === "submitted") return ALREADY_SUBMITTED();

    const db = createServerClient();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const outcome = await trySubmit(db, session.id);
        if (outcome.kind === "response") return outcome.response;
        // 결과 내용은 여기서 돌려주지 않는다 (7단계 조회 API 에서만 준다).
        return jsonResponse({ ok: true, next: `/c/${courseCode}/result` });
      } catch (error) {
        if (error instanceof SessionFunctionError && error.code === "RESPONSES_CHANGED") continue;
        throw error;
      }
    }
    return RESPONSES_CHANGED();
  } catch (error) {
    if (error instanceof SessionFunctionError) {
      switch (error.code) {
        case "ALREADY_SUBMITTED":
          return ALREADY_SUBMITTED();
        case "SESSION_NOT_FOUND":
          return UNAUTHORIZED();
        case "GENERAL_INCOMPLETE":
          return GENERAL_INCOMPLETE();
        case "ADJECTIVES_INSUFFICIENT":
          return ADJECTIVES_INSUFFICIENT();
      }
    }
    if (error instanceof SubmissionError) {
      return errorResponse(400, "INVALID_SUBMISSION", "제출할 수 없는 응답이 있어요. 화면을 새로고침한 뒤 다시 시도해 주세요.");
    }
    console.error("[session/submit]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
