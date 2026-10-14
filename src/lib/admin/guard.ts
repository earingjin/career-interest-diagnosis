import "server-only";
import { redirect } from "next/navigation";
import { hasValidAdminSession } from "./access";
import { readAdminToken } from "./cookie";

/** 요청의 관리자 쿠키가 유효한지. */
export async function isAdminAuthenticated(): Promise<boolean> {
  return hasValidAdminSession(await readAdminToken());
}

/**
 * 관리자 페이지와 관리자 API 는 proxy 에만 기대지 않고, 데이터에 가까운 이곳에서 한 번 더 확인한다.
 * 인증이 없으면 로그인 화면으로 보낸다 (redirect 는 throw 로 동작하므로 try/catch 밖에서 호출한다).
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
}
