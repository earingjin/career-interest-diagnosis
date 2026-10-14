import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { AdminConfig } from "../config";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "../session";
import { makeConfig } from "./helpers";

const NOW = Date.UTC(2026, 9, 20, 9, 0, 0);
let config: AdminConfig;

beforeAll(async () => {
  config = await makeConfig();
});

// 서명 방식을 그대로 따라 "서명은 맞지만 payload 가 잘못된" 토큰을 만든다.
function signedToken(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`jd-admin-session.${encoded}`, "utf8").digest("base64url");
  return `${encoded}.${signature}`;
}

describe("관리자 세션 토큰", () => {
  it("쿠키 이름은 고객용 jd_session 과 다르다", () => {
    expect(ADMIN_COOKIE_NAME).toBe("jd_admin");
    expect(ADMIN_COOKIE_NAME).not.toBe("jd_session");
  });

  it("발급 직후에는 유효하다", () => {
    expect(verifyAdminSessionToken(createAdminSessionToken(config, NOW), config, NOW)).toBe(true);
    expect(verifyAdminSessionToken(createAdminSessionToken(config, NOW), config, NOW + 1000 * 60 * 60)).toBe(true);
  });

  it("만료 시각이 지나면 거부한다 (8시간)", () => {
    const token = createAdminSessionToken(config, NOW);
    const expiresAt = NOW + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
    expect(verifyAdminSessionToken(token, config, expiresAt - 1000)).toBe(true);
    expect(verifyAdminSessionToken(token, config, expiresAt)).toBe(false);
    expect(verifyAdminSessionToken(token, config, expiresAt + 86_400_000)).toBe(false);
  });

  it("값이 없거나 비어 있으면 거부한다", () => {
    for (const token of [undefined, null, "", ".", "a.", ".b", "no-dot", "a.b.c"]) {
      expect(verifyAdminSessionToken(token, config, NOW), String(token)).toBe(false);
    }
  });

  it("payload 를 바꾸면(변조) 거부한다", () => {
    const [encoded, signature] = createAdminSessionToken(config, NOW).split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 999_999 })).toString("base64url");
    expect(verifyAdminSessionToken(`${forged}.${signature}`, config, NOW)).toBe(false);
  });

  it("서명을 바꾸거나 잘라내면 거부한다", () => {
    const [encoded, signature] = createAdminSessionToken(config, NOW).split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(verifyAdminSessionToken(`${encoded}.${flipped}`, config, NOW)).toBe(false);
    expect(verifyAdminSessionToken(`${encoded}.${signature.slice(0, -2)}`, config, NOW)).toBe(false);
    expect(verifyAdminSessionToken(`${encoded}.${"x".repeat(signature.length)}`, config, NOW)).toBe(false);
  });

  it("다른 비밀키로 만든 토큰은 거부한다", () => {
    const token = createAdminSessionToken({ ...config, sessionSecret: "o".repeat(40) }, NOW);
    expect(verifyAdminSessionToken(token, config, NOW)).toBe(false);
  });

  it("비밀번호(해시)가 바뀌면 이전에 발급한 세션은 거부한다", async () => {
    const token = createAdminSessionToken(config, NOW);
    const changed = await makeConfig({ sessionSecret: config.sessionSecret });
    expect(changed.passwordHash).not.toBe(config.passwordHash);
    expect(verifyAdminSessionToken(token, changed, NOW)).toBe(false);
  });

  it("서명이 맞아도 payload 가 규칙에 어긋나면 거부한다", () => {
    const valid = JSON.parse(Buffer.from(createAdminSessionToken(config, NOW).split(".")[0], "base64url").toString());
    const secret = config.sessionSecret;
    expect(verifyAdminSessionToken(signedToken(valid, secret), config, NOW)).toBe(true); // 기준: 이 방식으로 만든 정상 토큰
    const bad: Record<string, object> = {
      "허용 기간(8시간)보다 긴 토큰": { ...valid, exp: valid.iat + ADMIN_SESSION_MAX_AGE_SECONDS + 1 },
      "버전이 다름": { ...valid, v: 2 },
      "pv 없음": { v: 1, iat: valid.iat, exp: valid.exp },
      "다른 비밀번호 버전": { ...valid, pv: "0".repeat(32) },
      "iat 가 숫자가 아님": { ...valid, iat: "1" },
      "exp 가 소수": { ...valid, exp: valid.exp + 0.5 },
    };
    for (const [name, payload] of Object.entries(bad)) {
      expect(verifyAdminSessionToken(signedToken(payload, secret), config, NOW), name).toBe(false);
    }
    expect(verifyAdminSessionToken("a".repeat(3000), config, NOW)).toBe(false); // 너무 긴 토큰
  });

  it("미래 시각(1분 초과)에 발급된 토큰은 거부한다", () => {
    const future = createAdminSessionToken(config, NOW + 10 * 60 * 1000);
    expect(verifyAdminSessionToken(future, config, NOW)).toBe(false);
    expect(verifyAdminSessionToken(future, config, NOW + 10 * 60 * 1000)).toBe(true);
  });

  it("토큰에 ID, 비밀번호, 비밀키가 들어가지 않는다", () => {
    const token = createAdminSessionToken(config, NOW);
    const payload = Buffer.from(token.split(".")[0], "base64url").toString();
    for (const secret of [config.id, config.passwordHash, config.sessionSecret]) {
      expect(token).not.toContain(secret);
      expect(payload).not.toContain(secret);
    }
  });
});
