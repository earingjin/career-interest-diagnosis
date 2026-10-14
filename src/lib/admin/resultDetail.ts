import "server-only";
import { loadSessionResult, type SessionResultOutcome } from "../result/sessionResult";
import { createServerClient } from "../supabase/server";
import { requireAdmin } from "./guard";

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminResultDetailOutcome = { kind: "invalid_id" } | SessionResultOutcome;

/**
 * 관리자가 세션 ID 로 고객 한 명의 결과를 조회한다.
 * - 호출할 때마다 관리자 인증을 확인한다 (proxy 나 페이지의 확인에만 기대지 않는다). 고객 쿠키로는 통과하지 못한다.
 * - 닉네임은 중복될 수 있으므로 세션 ID 로만 찾는다.
 * - 결과 내용은 고객 결과 화면과 같은 loadSessionResult 로 만든다.
 * 인증이 없으면 로그인 화면으로 redirect 하며(throw), DB 는 조회하지 않는다.
 */
export async function loadAdminResultDetail(sessionId: string): Promise<AdminResultDetailOutcome> {
  await requireAdmin();
  if (!SESSION_ID_PATTERN.test(sessionId)) return { kind: "invalid_id" };
  return loadSessionResult(createServerClient(), sessionId.toLowerCase());
}
