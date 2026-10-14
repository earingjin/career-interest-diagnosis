import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AdminConfig } from "./config";
import { verifyPassword } from "./password";

// 로그인 실패 제한: 최근 15분 동안의 실패 횟수가 한도를 넘으면 올바른 비밀번호여도 거부한다.
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_IP = 5;
export const MAX_FAILURES_PER_ACCOUNT = 20; // IP 를 바꿔 가며 시도하는 경우의 안전장치
export const MAX_INPUT_LENGTH = 500;

/** 실패 기록 저장소. 실제 구현은 auth_attempts 테이블(attemptStore.ts), 테스트는 메모리 구현. */
export type AttemptStore = {
  recordFailures(keys: string[], at: Date): Promise<void>;
  countFailures(key: string, since: Date): Promise<number>;
  clearFailures(keys: string[]): Promise<void>;
};

export type LoginResult = { status: "ok" } | { status: "invalid" } | { status: "locked" };

/** 기록에는 원본 IP 를 남기지 않고, 비밀키로 만든 해시만 남긴다. */
export function attemptKeys(sessionSecret: string, ip: string): { ipKey: string; accountKey: string } {
  const key = (label: string) =>
    createHmac("sha256", sessionSecret).update(`admin-login:${label}`, "utf8").digest("hex");
  return { ipKey: key(`ip:${ip}`), accountKey: key("account") };
}

/** 프록시가 붙여 주는 클라이언트 IP. 없으면 "unknown". (프록시 없이 직접 노출되면 위조될 수 있다.) */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 100);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * 로그인을 시도한다.
 * 1) 먼저 이번 시도를 실패로 기록하고 (동시에 여러 요청이 와도 모두 횟수에 들어가도록)
 * 2) 한도를 넘었으면 비밀번호를 확인하지 않고 거부한다.
 * 3) ID 가 틀려도 비밀번호 해시 계산을 똑같이 수행해 응답 시간으로 ID 를 알아내지 못하게 한다.
 * 4) 성공하면 이 IP 와 계정의 실패 기록을 지운다.
 * 저장소 오류는 그대로 던진다 (호출하는 쪽이 로그인을 거부해야 한다).
 */
export async function attemptLogin(args: {
  config: AdminConfig;
  id: string;
  password: string;
  ip: string;
  store: AttemptStore;
  now?: number;
}): Promise<LoginResult> {
  const { config, id, password, ip, store } = args;
  const now = args.now ?? Date.now();
  const { ipKey, accountKey } = attemptKeys(config.sessionSecret, ip);
  const since = new Date(now - LOGIN_WINDOW_MS);

  await store.recordFailures([ipKey, accountKey], new Date(now));
  const [ipFailures, accountFailures] = await Promise.all([
    store.countFailures(ipKey, since),
    store.countFailures(accountKey, since),
  ]);
  if (ipFailures > MAX_FAILURES_PER_IP || accountFailures > MAX_FAILURES_PER_ACCOUNT) {
    return { status: "locked" };
  }

  const inputTooLong = id.length > MAX_INPUT_LENGTH || password.length > MAX_INPUT_LENGTH;
  const passwordOk = await verifyPassword(inputTooLong ? "" : password, config.passwordHash);
  const idOk = timingSafeEqual(digest(id), digest(config.id));

  if (passwordOk && idOk && !inputTooLong) {
    await store.clearFailures([ipKey, accountKey]);
    return { status: "ok" };
  }
  return { status: "invalid" };
}
