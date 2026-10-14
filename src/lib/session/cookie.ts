import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "jd_session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// 값은 원본 토큰이다. DB 에는 sha256Hex 해시만 저장한다.
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return value ? value : null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
