import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasValidAdminSession, isPublicAdminPath } from "../access";
import type { AdminConfig } from "../config";
import { createAdminSessionToken, ADMIN_COOKIE_NAME } from "../session";
import { proxy } from "../../../proxy";
import { envFor, makeConfig } from "./helpers";

let config: AdminConfig;
let env: Record<string, string>;

beforeAll(async () => {
  config = await makeConfig();
  env = envFor(config);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function useEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

function request(path: string, token?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: token === undefined ? {} : { cookie: `${ADMIN_COOKIE_NAME}=${token}` },
  });
}

const isPassThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("hasValidAdminSession", () => {
  it("유효한 토큰만 통과한다", () => {
    expect(hasValidAdminSession(createAdminSessionToken(config), env)).toBe(true);
    expect(hasValidAdminSession(undefined, env)).toBe(false);
    expect(hasValidAdminSession("garbage", env)).toBe(false);
  });

  it("환경 변수가 없거나 잘못되면 유효한 토큰이어도 거부한다", () => {
    const token = createAdminSessionToken(config);
    expect(hasValidAdminSession(token, {})).toBe(false);
    expect(hasValidAdminSession(token, { ...env, ADMIN_SESSION_SECRET: undefined })).toBe(false);
    expect(hasValidAdminSession(token, { ...env, ADMIN_PASSWORD_HASH: "broken" })).toBe(false);
    expect(hasValidAdminSession(token, { ...env, ADMIN_ID: "" })).toBe(false);
  });
});

describe("isPublicAdminPath", () => {
  it("로그인 화면과 로그인·로그아웃 API 만 공개한다", () => {
    for (const path of ["/admin/login", "/admin/login/", "/api/admin/login", "/api/admin/logout"]) {
      expect(isPublicAdminPath(path), path).toBe(true);
    }
    for (const path of ["/admin", "/admin/", "/admin/results", "/admin/results/abc", "/admin/login/x", "/admin/loginx", "/api/admin/results"]) {
      expect(isPublicAdminPath(path), path).toBe(false);
    }
  });
});

describe("proxy: 관리자 영역 접근 제한", () => {
  const protectedPaths = ["/admin", "/admin/", "/admin/results", "/admin/results/abc-123", "/admin/results/a/b/c"];

  it("쿠키가 없으면 보호 경로를 로그인 화면으로 보낸다", () => {
    useEnv(env);
    for (const path of protectedPaths) {
      const response = proxy(request(path));
      expect(response.status, path).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname, path).toBe("/admin/login");
    }
  });

  it("관리자 API 는 리다이렉트 대신 401 을 준다", () => {
    useEnv(env);
    const response = proxy(request("/api/admin/results"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("유효한 관리자 쿠키가 있으면 통과한다", () => {
    useEnv(env);
    const token = createAdminSessionToken(config);
    for (const path of [...protectedPaths, "/api/admin/results"]) {
      expect(isPassThrough(proxy(request(path, token))), path).toBe(true);
    }
  });

  it("변조된 쿠키는 거부한다", () => {
    useEnv(env);
    const [encoded, signature] = createAdminSessionToken(config).split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 1_000_000 })).toString("base64url");
    for (const token of [`${forged}.${signature}`, `${encoded}.${signature.slice(0, -3)}AAA`, "abc.def", ""]) {
      expect(proxy(request("/admin/results", token)).status, token).toBe(307);
    }
  });

  it("만료된 쿠키는 거부한다", () => {
    useEnv(env);
    const old = createAdminSessionToken(config, Date.now() - 9 * 60 * 60 * 1000);
    expect(proxy(request("/admin", old)).status).toBe(307);
  });

  it("다른 비밀키로 서명한 쿠키는 거부한다", () => {
    useEnv(env);
    const foreign = createAdminSessionToken({ ...config, sessionSecret: "z".repeat(40) });
    expect(proxy(request("/admin", foreign)).status).toBe(307);
  });

  it("고객용 jd_session 쿠키로는 통과하지 못한다", () => {
    useEnv(env);
    const response = proxy(
      new NextRequest("http://localhost:3000/admin", { headers: { cookie: "jd_session=abc; other=1" } }),
    );
    expect(response.status).toBe(307);
  });

  it("환경 변수가 없으면 유효한 토큰이 있어도 거부한다 (안전하게 닫힘)", () => {
    const token = createAdminSessionToken(config);
    useEnv({ ADMIN_ID: undefined, ADMIN_PASSWORD_HASH: undefined, ADMIN_SESSION_SECRET: undefined });
    expect(proxy(request("/admin/results", token)).status).toBe(307);
    expect(proxy(request("/api/admin/results", token)).status).toBe(401);
  });

  it("로그인 화면과 로그인·로그아웃 API 는 인증 없이도 열려 있다", () => {
    useEnv(env);
    for (const path of ["/admin/login", "/api/admin/login", "/api/admin/logout"]) {
      expect(isPassThrough(proxy(request(path))), path).toBe(true);
    }
  });

  it("결과 상세 URL(/admin/results/[sessionId])은 인증 없이, 고객 쿠키만으로, 변조·만료 쿠키로 열 수 없다", () => {
    useEnv(env);
    const detail = "/admin/results/00000000-0000-4000-8000-000000000001";
    expect(proxy(request(detail)).status).toBe(307);
    expect(proxy(new NextRequest(`http://localhost:3000${detail}`, { headers: { cookie: "jd_session=customer-token" } })).status).toBe(307);
    expect(proxy(request(detail, "forged.token")).status).toBe(307);
    expect(proxy(request(detail, createAdminSessionToken(config, Date.now() - 9 * 60 * 60 * 1000))).status).toBe(307);
    expect(new URL(proxy(request(detail)).headers.get("location")!).pathname).toBe("/admin/login");
    expect(isPassThrough(proxy(request(detail, createAdminSessionToken(config))))).toBe(true);
  });

  it("matcher 는 /admin 과 /api/admin 하위 경로만 대상으로 한다", async () => {
    const { config: proxyConfig } = await import("../../../proxy");
    expect(proxyConfig.matcher).toEqual(["/admin/:path*", "/api/admin/:path*"]);
  });
});
