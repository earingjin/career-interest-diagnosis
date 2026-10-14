import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,10}$/;
const LAST4_PATTERN = /^[0-9]{4}$/;

const MIN_SECRET_LENGTH = 32;

export function getHashSecret(): string {
  const secret = process.env.SESSION_HASH_SECRET;
  // 오류 메시지에는 secret 값을 넣지 않는다.
  if (!secret) {
    throw new Error("SESSION_HASH_SECRET 환경 변수가 설정되지 않았거나 비어 있습니다.");
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_HASH_SECRET 은 ${MIN_SECRET_LENGTH}자 이상이어야 합니다.`);
  }
  return secret;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  if (!secret) {
    throw new Error("secret 이 비어 있습니다.");
  }
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCourseCode(): string {
  // 18바이트 → base64url 24자 ([A-Za-z0-9_-] 만 사용)
  return randomBytes(18).toString("base64url");
}

export function phoneKey(secret: string, last4: string): string {
  if (!LAST4_PATTERN.test(last4)) {
    throw new Error("휴대폰 뒷자리는 숫자 4자리여야 합니다.");
  }
  return hmacHex(secret, last4);
}

export function nicknameIsValid(nickname: string): boolean {
  return NICKNAME_PATTERN.test(nickname);
}
