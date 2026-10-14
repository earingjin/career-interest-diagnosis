import { loadAdminConfig } from "./config";
import { verifyAdminSessionToken } from "./session";

/**
 * 쿠키 토큰이 유효한 관리자 세션인지. 환경 변수가 없거나 잘못됐으면 항상 false (접근 거부).
 * proxy 와 서버 페이지가 같은 함수를 쓴다.
 */
export function hasValidAdminSession(
  token: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): boolean {
  try {
    return verifyAdminSessionToken(token, loadAdminConfig(env), now);
  } catch {
    return false;
  }
}

/** 로그인 전에도 열려 있어야 하는 경로 (로그인 화면, 로그인·로그아웃 API) */
export function isPublicAdminPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === "/admin/login" || path === "/api/admin/login" || path === "/api/admin/logout";
}
