import { clearAdminCookie } from "@/lib/admin/cookie";
import { FORBIDDEN_ORIGIN, jsonResponse } from "@/lib/session/http";
import { isAdminSameOriginRequest } from "@/lib/admin/origin";

// 쿠키가 없어도 항상 성공한다. 세션은 서명된 쿠키뿐이라 쿠키를 지우면 로그아웃이다.
export async function POST(request: Request) {
  if (!isAdminSameOriginRequest(request)) return FORBIDDEN_ORIGIN();
  await clearAdminCookie();
  return jsonResponse({ ok: true, next: "/admin/login" });
}
