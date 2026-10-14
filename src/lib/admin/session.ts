import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AdminConfig } from "./config";

// 관리자 세션은 서명된 쿠키(상태 없음)다. 고객용 jd_session 과 이름도 비밀키도 공유하지 않는다.
export const ADMIN_COOKIE_NAME = "jd_admin";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type KeyMaterial = Pick<AdminConfig, "passwordHash" | "sessionSecret">;
type Payload = { v: 1; iat: number; exp: number; pv: string };

/** 비밀번호 해시의 지문. 비밀번호를 바꾸면 이전에 발급한 세션이 모두 무효가 된다. */
function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash.trim(), "utf8").digest("hex").slice(0, 32);
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(`jd-admin-session.${encodedPayload}`, "utf8").digest("base64url");
}

/** 로그인에 성공했을 때 쿠키에 담을 토큰을 만든다. now 는 밀리초. */
export function createAdminSessionToken(config: KeyMaterial, now: number = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: Payload = {
    v: 1,
    iat,
    exp: iat + ADMIN_SESSION_MAX_AGE_SECONDS,
    pv: passwordVersion(config.passwordHash),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, config.sessionSecret)}`;
}

/** 토큰이 유효한지: 서명, 형식, 만료, 비밀번호 버전을 모두 확인한다. 어떤 이상이든 false. */
export function verifyAdminSessionToken(
  token: string | undefined | null,
  config: KeyMaterial,
  now: number = Date.now(),
): boolean {
  if (!token || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return false;
  const [encoded, signature] = parts;

  const expected = Buffer.from(sign(encoded, config.sessionSecret), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof payload !== "object" || payload === null) return false;
  if (payload.v !== 1 || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return false;

  const nowSeconds = Math.floor(now / 1000);
  const { iat, exp } = payload as Payload;
  if (exp <= nowSeconds) return false; // 만료
  if (iat > nowSeconds + 60) return false; // 미래에 발급된 토큰
  if (exp - iat > ADMIN_SESSION_MAX_AGE_SECONDS) return false; // 허용 기간보다 긴 토큰

  const expectedVersion = Buffer.from(passwordVersion(config.passwordHash), "utf8");
  const actualVersion = Buffer.from(typeof payload.pv === "string" ? payload.pv : "", "utf8");
  return actualVersion.length === expectedVersion.length && timingSafeEqual(actualVersion, expectedVersion);
}
