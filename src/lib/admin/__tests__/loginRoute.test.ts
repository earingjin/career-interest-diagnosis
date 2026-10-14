import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminConfig } from "../config";
import { TEST_ID, TEST_PASSWORD, envFor, makeConfig, memoryStore } from "./helpers";

vi.mock("server-only", () => ({}));

const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

let store = memoryStore();
let storeFails = false;
vi.mock("@/lib/admin/attemptStore", () => ({
  createDbAttemptStore: () => {
    if (storeFails) throw new Error("db down");
    return store;
  },
}));

import { POST as login } from "@/app/api/admin/login/route";
import { POST as logout } from "@/app/api/admin/logout/route";

const ORIGIN = "http://localhost:3000";
let config: AdminConfig;

beforeAll(async () => {
  config = await makeConfig();
});

beforeEach(() => {
  store = memoryStore();
  storeFails = false;
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  for (const [name, value] of Object.entries(envFor(config))) vi.stubEnv(name, value);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function post(path: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const good = { id: TEST_ID, password: TEST_PASSWORD };

describe("POST /api/admin/login", () => {
  it("맞는 ID 와 비밀번호면 200 과 관리자 쿠키를 준다 (HttpOnly, SameSite=strict)", async () => {
    const response = await login(post("/api/admin/login", good));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/admin" });

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("jd_admin");
    expect(value).not.toContain(config.sessionSecret);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/" });
    expect(options.maxAge).toBe(60 * 60 * 8);
  });

  it("출처(Origin)가 없거나 다르면 403 이고 쿠키를 주지 않는다", async () => {
    const cases: Record<string, string>[] = [{}, { origin: "https://evil.example" }, { origin: "http://192.168.0.10:3000" }];
    for (const headers of cases) {
      const response = await login(post("/api/admin/login", good, headers));
      expect(response.status, JSON.stringify(headers)).toBe(403);
    }
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(0);
  });

  it("잘못된 비밀번호는 401, ID 가 틀려도 같은 응답이라 구분할 수 없다", async () => {
    const wrongPassword = await login(post("/api/admin/login", { id: TEST_ID, password: "wrong-password-1" }));
    const wrongId = await login(post("/api/admin/login", { id: "nobody", password: TEST_PASSWORD }));
    expect(wrongPassword.status).toBe(401);
    expect(wrongId.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await wrongId.json());
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("형식이 틀린 요청은 400", async () => {
    for (const body of ["not json", "{}", { id: TEST_ID }, { id: 1, password: 2 }, null, []]) {
      expect((await login(post("/api/admin/login", body))).status, JSON.stringify(body)).toBe(400);
    }
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("실패가 반복되면 429 로 잠기고, 올바른 비밀번호도 거부한다", async () => {
    const headers = { origin: ORIGIN, "x-forwarded-for": "203.0.113.5" };
    for (let i = 0; i < 5; i++) {
      expect((await login(post("/api/admin/login", { id: TEST_ID, password: "wrong-password-1" }, headers))).status).toBe(401);
    }
    const locked = await login(post("/api/admin/login", good, headers));
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBe("900");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("환경 변수가 없으면 올바른 비밀번호여도 503 이고 쿠키를 주지 않는다", async () => {
    for (const name of ["ADMIN_ID", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"]) {
      vi.stubEnv(name, "");
      const response = await login(post("/api/admin/login", good));
      expect(response.status, name).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain(name); // 어떤 변수가 문제인지 밖으로 알리지 않는다
      vi.stubEnv(name, envFor(config)[name]);
    }
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("실패 기록 저장소 오류 시 로그인을 허용하지 않는다 (500)", async () => {
    storeFails = true;
    const response = await login(post("/api/admin/login", good));
    expect(response.status).toBe(500);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("응답과 쿠키 어디에도 비밀번호 해시와 비밀키가 없다", async () => {
    const response = await login(post("/api/admin/login", good));
    const text = JSON.stringify(await response.json()) + JSON.stringify(cookieStore.set.mock.calls);
    expect(text).not.toContain(config.passwordHash);
    expect(text).not.toContain(config.sessionSecret);
    expect(text).not.toContain(TEST_PASSWORD);
  });
});

describe("POST /api/admin/logout", () => {
  it("관리자 쿠키를 지운다", async () => {
    const response = await logout(post("/api/admin/logout", {}));
    expect(response.status).toBe(200);
    expect(cookieStore.delete).toHaveBeenCalledWith("jd_admin");
  });

  it("출처가 다르면 403 이고 쿠키를 지우지 않는다", async () => {
    const response = await logout(post("/api/admin/logout", {}, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});
