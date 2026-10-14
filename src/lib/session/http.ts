const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

// 모든 오류 응답은 { error: { code, message } } 형식이다.
export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

export const FORBIDDEN_ORIGIN = () => errorResponse(403, "FORBIDDEN_ORIGIN", "허용되지 않은 요청이에요.");
export const UNAUTHORIZED = () =>
  errorResponse(401, "UNAUTHORIZED", "세션을 찾을 수 없어요. 처음 화면에서 다시 시작해 주세요.");
export const SERVER_ERROR = () =>
  errorResponse(500, "SERVER_ERROR", "잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");

/** JSON 본문을 읽는다. 형식이 잘못되었으면 undefined 를 돌려준다. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
