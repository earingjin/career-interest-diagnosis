import { createDbAttemptStore } from "@/lib/admin/attemptStore";
import { AdminConfigError, loadAdminConfig, type AdminConfig } from "@/lib/admin/config";
import { setAdminCookie } from "@/lib/admin/cookie";
import { attemptLogin, clientIp, LOGIN_WINDOW_MS } from "@/lib/admin/login";
import { createAdminSessionToken } from "@/lib/admin/session";
import { FORBIDDEN_ORIGIN, errorResponse, jsonResponse, readJson } from "@/lib/session/http";
import { isAdminSameOriginRequest } from "@/lib/admin/origin";

export async function POST(request: Request) {
  // 로그인 요청의 출처 검사 (다른 사이트에서 보낸 요청 거부)
  if (!isAdminSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  // 환경 변수가 없거나 잘못됐으면 로그인을 허용하지 않는다. 로그에는 변수 이름만 남긴다.
  let config: AdminConfig;
  try {
    config = loadAdminConfig();
  } catch (error) {
    console.error("[admin/login]", error instanceof AdminConfigError ? error.message : "설정 오류");
    return errorResponse(503, "ADMIN_NOT_CONFIGURED", "관리자 로그인을 사용할 수 없어요.");
  }

  const body = await readJson(request);
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof record.id !== "string" || typeof record.password !== "string") {
    return errorResponse(400, "INVALID_REQUEST", "ID 와 비밀번호를 입력해 주세요.");
  }

  try {
    const result = await attemptLogin({
      config,
      id: record.id,
      password: record.password,
      ip: clientIp(request.headers),
      store: createDbAttemptStore(),
    });

    if (result.status === "locked") {
      const response = errorResponse(429, "TOO_MANY_ATTEMPTS", "시도가 너무 많아요. 잠시 후 다시 시도해 주세요.");
      response.headers.set("Retry-After", String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
      return response;
    }
    if (result.status === "invalid") {
      // ID 가 틀렸는지 비밀번호가 틀렸는지 알려주지 않는다.
      return errorResponse(401, "INVALID_CREDENTIALS", "ID 또는 비밀번호가 올바르지 않아요.");
    }

    await setAdminCookie(createAdminSessionToken(config));
    return jsonResponse({ ok: true, next: "/admin" });
  } catch (error) {
    // 실패 기록 저장소 등의 오류: 로그인을 허용하지 않는다.
    console.error("[admin/login]", error instanceof Error ? error.message : error);
    return errorResponse(500, "SERVER_ERROR", "잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  }
}
