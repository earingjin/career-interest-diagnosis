import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phoneKey } from "../../security/hash";
import { buildPhoneLast4Lookup, createPhoneLast4Resolver } from "../phoneLast4";

const SECRET = "h".repeat(40);

describe("buildPhoneLast4Lookup", () => {
  it("0000~9999 를 모두 담고, 저장 때와 같은 phoneKey 값으로 역조회한다", () => {
    const lookup = buildPhoneLast4Lookup(SECRET);
    expect(lookup.size).toBe(10000);
    for (const last4 of ["0000", "0007", "1234", "9999"]) {
      expect(lookup.get(phoneKey(SECRET, last4))).toBe(last4);
    }
  });
});

describe("createPhoneLast4Resolver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("이미 저장된 phone_key 를 현재 SESSION_HASH_SECRET 으로 복원한다", () => {
    vi.stubEnv("SESSION_HASH_SECRET", SECRET);
    const resolve = createPhoneLast4Resolver();
    expect(resolve(phoneKey(SECRET, "0420"))).toBe("0420");
    expect(resolve(phoneKey(SECRET, "5678"))).toBe("5678");
  });

  it("다른 비밀키로 만든 값, 빈 값, 형식이 다른 값은 null", () => {
    vi.stubEnv("SESSION_HASH_SECRET", SECRET);
    const resolve = createPhoneLast4Resolver();
    expect(resolve(phoneKey("o".repeat(40), "1234"))).toBeNull();
    expect(resolve("")).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve("1234")).toBeNull();
  });

  it("비밀키가 바뀌면 새 비밀키 기준으로 다시 계산한다", () => {
    vi.stubEnv("SESSION_HASH_SECRET", SECRET);
    createPhoneLast4Resolver();
    const other = "k".repeat(40);
    vi.stubEnv("SESSION_HASH_SECRET", other);
    const resolve = createPhoneLast4Resolver();
    expect(resolve(phoneKey(other, "1111"))).toBe("1111");
    expect(resolve(phoneKey(SECRET, "1111"))).toBeNull();
  });

  it("비밀키가 없으면 모두 null 이고 로그에 비밀키를 남기지 않는다", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SESSION_HASH_SECRET", "");
    const resolve = createPhoneLast4Resolver();
    expect(resolve(phoneKey(SECRET, "1234"))).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
  });
});
