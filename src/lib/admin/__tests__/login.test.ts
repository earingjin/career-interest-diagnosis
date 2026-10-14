import { beforeAll, describe, expect, it } from "vitest";
import type { AdminConfig } from "../config";
import {
  LOGIN_WINDOW_MS,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_IP,
  attemptKeys,
  attemptLogin,
  clientIp,
} from "../login";
import { TEST_ID, TEST_PASSWORD, makeConfig, memoryStore } from "./helpers";

const NOW = Date.UTC(2026, 9, 20, 9, 0, 0);
let config: AdminConfig;

beforeAll(async () => {
  config = await makeConfig();
});

const login = (store: ReturnType<typeof memoryStore>, over: { id?: string; password?: string; ip?: string; now?: number } = {}) =>
  attemptLogin({
    config,
    id: over.id ?? TEST_ID,
    password: over.password ?? TEST_PASSWORD,
    ip: over.ip ?? "203.0.113.1",
    store,
    now: over.now ?? NOW,
  });

describe("attemptLogin", () => {
  it("맞는 ID 와 비밀번호는 통과한다", async () => {
    expect(await login(memoryStore())).toEqual({ status: "ok" });
  });

  it("잘못된 비밀번호는 거부한다", async () => {
    expect(await login(memoryStore(), { password: "wrong-password-1" })).toEqual({ status: "invalid" });
  });

  it("잘못된 ID 는 비밀번호가 맞아도 거부한다", async () => {
    expect(await login(memoryStore(), { id: "someone-else" })).toEqual({ status: "invalid" });
  });

  it("빈 값과 너무 긴 입력은 거부한다", async () => {
    const store = memoryStore();
    expect(await login(store, { id: "", password: "" })).toEqual({ status: "invalid" });
    expect(await login(store, { password: "x".repeat(100_000) })).toEqual({ status: "invalid" });
  });

  it("IP 당 실패가 한도(5회)를 넘으면 올바른 비밀번호여도 잠긴다", async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
      expect(await login(store, { password: "wrong-password-1" })).toEqual({ status: "invalid" });
    }
    expect(await login(store)).toEqual({ status: "locked" });
    expect(await login(store, { password: "wrong-password-1" })).toEqual({ status: "locked" });
  });

  it("다른 IP 는 영향을 받지 않는다", async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_FAILURES_PER_IP + 1; i++) await login(store, { password: "wrong-password-1" });
    expect(await login(store)).toEqual({ status: "locked" });
    expect(await login(store, { ip: "198.51.100.7" })).toEqual({ status: "ok" });
  });

  it("IP 를 바꿔 가며 시도해도 계정 전체 한도(20회)를 넘으면 잠긴다", async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) {
      await login(store, { password: "wrong-password-1", ip: `10.0.0.${i}` });
    }
    expect(await login(store, { ip: "10.9.9.9" })).toEqual({ status: "locked" });
  });

  it("15분이 지나면 실패 기록이 만료되어 다시 시도할 수 있다", async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_FAILURES_PER_IP + 1; i++) await login(store, { password: "wrong-password-1" });
    expect(await login(store)).toEqual({ status: "locked" });
    expect(await login(store, { now: NOW + LOGIN_WINDOW_MS + 1000 })).toEqual({ status: "ok" });
  });

  it("성공하면 실패 기록을 지운다", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await login(store, { password: "wrong-password-1" });
    expect(store.rows.length).toBeGreaterThan(0);
    expect(await login(store)).toEqual({ status: "ok" });
    expect(store.rows).toHaveLength(0);
  });

  it("기록에 원본 IP 가 남지 않는다", async () => {
    const store = memoryStore();
    await login(store, { password: "wrong-password-1", ip: "203.0.113.1" });
    expect(JSON.stringify(store.rows)).not.toContain("203.0.113.1");
    const { ipKey, accountKey } = attemptKeys(config.sessionSecret, "203.0.113.1");
    expect(store.rows.map((r) => r.key).sort()).toEqual([ipKey, accountKey].sort());
  });

  it("저장소 오류는 그대로 던진다 (호출하는 쪽이 로그인을 거부한다)", async () => {
    const broken = memoryStore();
    broken.recordFailures = async () => {
      throw new Error("db down");
    };
    await expect(login(broken)).rejects.toThrow("db down");
  });
});

describe("clientIp", () => {
  it("x-forwarded-for 의 첫 값, 없으면 x-real-ip, 없으면 unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
