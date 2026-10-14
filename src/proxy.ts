import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasValidAdminSession, isPublicAdminPath } from "@/lib/admin/access";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/session";

// 관리자 영역(/admin, /api/admin)의 선제 차단. 쿠키만 확인하는 빠른 검사이며,
// 각 페이지와 API 도 requireAdmin() 으로 다시 확인한다.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAdminPath(pathname)) return NextResponse.next();
  if (hasValidAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "관리자 로그인이 필요해요." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
