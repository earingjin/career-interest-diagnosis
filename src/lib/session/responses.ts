import "server-only";
import { dbError, type Db } from "./db";
import type { ProgressCounts } from "./progress";

export type ResponsesSnapshot = {
  /** 응답한 일반성향 항목만. 예) { g01: true, g02: false } */
  general: Record<string, boolean>;
  /** 선택한 형용사 항목만, 오름차순 */
  adjectives: string[];
};

/** 세션의 저장된 응답. 화면(서버 컴포넌트)과 GET /api/session/responses 가 함께 쓴다. */
export async function getResponsesSnapshot(db: Db, sessionId: string): Promise<ResponsesSnapshot> {
  const { data, error } = await db
    .from("responses")
    .select("item_id, value")
    .eq("session_id", sessionId)
    .order("item_id", { ascending: true });
  if (error) throw dbError("responses 조회", error);

  const general: Record<string, boolean> = {};
  const adjectives: string[] = [];
  for (const row of data ?? []) {
    if (row.item_id.startsWith("g")) general[row.item_id] = row.value;
    else if (row.value === true) adjectives.push(row.item_id);
  }
  return { general, adjectives };
}

/** 응답 개수를 DB 에서 직접 센다. 클라이언트가 보낸 값은 믿지 않는다. */
export async function countProgress(db: Db, sessionId: string): Promise<ProgressCounts> {
  const count = async (prefix: "g" | "a") => {
    const { count, error } = await db
      .from("responses")
      .select("item_id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .like("item_id", `${prefix}%`);
    if (error) throw dbError("responses 개수 조회", error);
    return count ?? 0;
  };
  const [answeredGeneralCount, selectedAdjectiveCount] = await Promise.all([count("g"), count("a")]);
  return { answeredGeneralCount, selectedAdjectiveCount };
}

/** DB 함수(save_response, submit_session)가 raise 하는 이유 코드 */
export const SESSION_FUNCTION_ERRORS = [
  "SESSION_NOT_FOUND",
  "ALREADY_SUBMITTED",
  "GENERAL_INCOMPLETE",
  "ADJECTIVES_INSUFFICIENT",
  "RESPONSES_CHANGED",
] as const;

export type SessionFunctionErrorCode = (typeof SESSION_FUNCTION_ERRORS)[number];

/** DB 함수가 상태 때문에 거부한 경우. 그 밖의 DB 오류는 일반 Error 로 던진다. */
export class SessionFunctionError extends Error {
  constructor(readonly code: SessionFunctionErrorCode) {
    super(code);
    this.name = "SessionFunctionError";
  }
}

function rpcError(context: string, error: { code?: string; message: string }): Error {
  const known = SESSION_FUNCTION_ERRORS.find((code) => error.message.includes(code));
  return known ? new SessionFunctionError(known) : dbError(context, error);
}

/**
 * 응답 하나를 저장한다 (DB 함수 save_response).
 * - g 항목: upsert
 * - a 항목: value=true 면 upsert, false 면 행 삭제 (선택한 항목만 행으로 남긴다)
 * DB 함수가 sessions 행에 공유 잠금을 잡고 status 를 확인하므로, 제출과 동시에 저장되어도
 * 제출 이후의 저장은 ALREADY_SUBMITTED 로 거부된다.
 */
export async function saveResponse(
  db: Db,
  sessionId: string,
  itemId: string,
  value: boolean,
): Promise<string> {
  const { data, error } = await db.rpc("save_response", {
    p_session_id: sessionId,
    p_item_id: itemId,
    p_value: value,
  });
  if (error) throw rpcError("save_response", error);
  return String(data);
}

export type ResponseRow = { itemId: string; value: boolean };

/** 세션의 응답 행을 모두 읽는다 (제출 계산용). */
export async function readResponseRows(db: Db, sessionId: string): Promise<ResponseRow[]> {
  const { data, error } = await db.from("responses").select("item_id, value").eq("session_id", sessionId);
  if (error) throw dbError("responses 조회", error);
  return (data ?? []).map((row) => ({ itemId: row.item_id, value: row.value }));
}

/**
 * 계산한 결과를 저장하고 제출 상태로 바꾼다 (DB 함수 submit_session).
 * DB 가 응답 지문을 다시 계산해 fingerprint 와 다르면 RESPONSES_CHANGED 로 거부한다.
 */
export async function submitSessionResult(
  db: Db,
  sessionId: string,
  fingerprint: string,
  result: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.rpc("submit_session", {
    p_session_id: sessionId,
    p_fingerprint: fingerprint,
    p_result: result,
  });
  if (error) throw rpcError("submit_session", error);
}
