import "server-only";
import { isSameOriginRequest } from "../session/request";

/** Next의 내부 URL 호스트와 실제 요청 Host가 다를 때도 브라우저의 동일 출처를 확인한다. */
export function isAdminSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return false;
  if (!host) return isSameOriginRequest(request);
  try {
    const browserOrigin = new URL(origin);
    const requestUrl = new URL(request.url);
    const actualOrigin = new URL(`${requestUrl.protocol}//${host}`);
    // Host에 경로·쿼리·자격증명을 섞어 넣는 입력은 허용하지 않는다.
    if (host.toLowerCase() !== actualOrigin.host || origin !== browserOrigin.origin) return false;
    return isSameOriginRequest(new Request(actualOrigin.origin, { headers: request.headers }));
  } catch {
    return false;
  }
}
