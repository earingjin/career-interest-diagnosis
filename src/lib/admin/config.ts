import { parsePasswordHash } from "./password";

export const MIN_SESSION_SECRET_LENGTH = 32;

export type AdminConfig = {
  id: string;
  passwordHash: string;
  sessionSecret: string;
};

/** 관리자 환경 변수가 없거나 잘못됐다. 메시지에는 변수 이름만 담고 값은 절대 담지 않는다. */
export class AdminConfigError extends Error {
  constructor(readonly invalid: string[]) {
    super(`관리자 환경 변수가 설정되지 않았거나 올바르지 않습니다: ${invalid.join(", ")}`);
    this.name = "AdminConfigError";
  }
}

type Env = Record<string, string | undefined>;

/**
 * 서버 환경 변수에서 관리자 설정을 읽는다. 하나라도 없거나 잘못되면 AdminConfigError 를 던진다.
 * 호출하는 쪽은 오류를 "접근 거부"로 처리해야 한다.
 */
export function loadAdminConfig(env: Env = process.env): AdminConfig {
  const invalid: string[] = [];

  const id = env.ADMIN_ID ?? "";
  if (id.trim() === "") invalid.push("ADMIN_ID");

  const passwordHash = env.ADMIN_PASSWORD_HASH ?? "";
  if (parsePasswordHash(passwordHash) === null) invalid.push("ADMIN_PASSWORD_HASH");

  const sessionSecret = env.ADMIN_SESSION_SECRET ?? "";
  if (sessionSecret.trim().length < MIN_SESSION_SECRET_LENGTH) invalid.push("ADMIN_SESSION_SECRET");

  if (invalid.length > 0) throw new AdminConfigError(invalid);
  return { id, passwordHash: passwordHash.trim(), sessionSecret };
}
