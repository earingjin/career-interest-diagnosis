import { afterEach, describe, expect, it, vi } from "vitest";

// server-only 는 서버 번들 밖에서 import 하면 throw 하므로 테스트에서는 비운다.
vi.mock("server-only", () => ({}));

import {
  generateCourseCode,
  generateSessionToken,
  getHashSecret,
  hmacHex,
  nicknameIsValid,
  phoneKey,
  sha256Hex,
} from "../hash";

describe("getHashSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("환경 변수가 없으면 throw 한다", () => {
    vi.stubEnv("SESSION_HASH_SECRET", undefined);
    expect(() => getHashSecret()).toThrow();
  });

  it("빈 값에서 throw 한다", () => {
    vi.stubEnv("SESSION_HASH_SECRET", "");
    expect(() => getHashSecret()).toThrow();
  });

  it("32자 미만이면 throw 하고 오류 메시지에 secret 을 담지 않는다", () => {
    const short = "short-secret-value-31-chars-abc"; // 31자
    expect(short).toHaveLength(31);
    vi.stubEnv("SESSION_HASH_SECRET", short);
    expect(() => getHashSecret()).toThrow();
    try {
      getHashSecret();
    } catch (e) {
      expect((e as Error).message).not.toContain(short);
    }
  });

  it("32자 이상이면 값을 그대로 돌려준다", () => {
    const ok = "x".repeat(32);
    vi.stubEnv("SESSION_HASH_SECRET", ok);
    expect(getHashSecret()).toBe(ok);
  });
});

describe("sha256Hex", () => {
  it("같은 입력에 같은 값, 다른 입력에 다른 값을 낸다", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
    expect(sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("알려진 값과 일치한다", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("hmacHex", () => {
  it("secret 이 다르면 결과가 다르다", () => {
    expect(hmacHex("s1", "1234")).not.toBe(hmacHex("s2", "1234"));
    expect(hmacHex("s1", "1234")).toBe(hmacHex("s1", "1234"));
    expect(hmacHex("s1", "1234")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("빈 secret 은 거부한다", () => {
    expect(() => hmacHex("", "1234")).toThrow();
  });
});

describe("generateSessionToken", () => {
  it("32바이트 base64url(43자)이고 매번 다르다", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("generateCourseCode", () => {
  it("16자 이상이고 허용 문자만 쓰며 매번 다르다", () => {
    const a = generateCourseCode();
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(a).not.toBe(generateCourseCode());
  });
});

describe("phoneKey", () => {
  it("숫자 4자리는 HMAC 값을 돌려준다", () => {
    expect(phoneKey("secret", "1234")).toBe(hmacHex("secret", "1234"));
    expect(phoneKey("secret", "1234")).not.toContain("1234");
  });

  it("5자리와 숫자가 아닌 값은 throw 한다", () => {
    expect(() => phoneKey("secret", "12345")).toThrow();
    expect(() => phoneKey("secret", "12a4")).toThrow();
    expect(() => phoneKey("secret", "123")).toThrow();
    expect(() => phoneKey("secret", "1234\n")).toThrow();
  });
});

describe("nicknameIsValid", () => {
  it("1자, 11자, 특수문자 포함 값을 거부한다", () => {
    expect(nicknameIsValid("가")).toBe(false);
    expect(nicknameIsValid("가".repeat(11))).toBe(false);
    expect(nicknameIsValid("나무!")).toBe(false);
    expect(nicknameIsValid("a b")).toBe(false);
    expect(nicknameIsValid("나무\n")).toBe(false);
  });

  it("2~10자의 한글·영문·숫자는 허용한다", () => {
    expect(nicknameIsValid("나무")).toBe(true);
    expect(nicknameIsValid("ab12")).toBe(true);
    expect(nicknameIsValid("가".repeat(10))).toBe(true);
  });
});
