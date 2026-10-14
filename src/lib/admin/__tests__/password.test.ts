import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { hashPassword, parsePasswordHash, verifyPassword } from "../password";

const FAST = { N: 4096, r: 8, p: 1 };

describe("password", () => {
  it("맞는 비밀번호는 통과하고 틀린 비밀번호는 거부한다", async () => {
    const hash = await hashPassword("비밀번호-12345", FAST);
    expect(await verifyPassword("비밀번호-12345", hash)).toBe(true);
    expect(await verifyPassword("비밀번호-12346", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("같은 비밀번호도 솔트가 달라 해시가 매번 다르다", async () => {
    expect(await hashPassword("same", FAST)).not.toBe(await hashPassword("same", FAST));
  });

  it("해시에 비밀번호 원문과 달러 기호가 들어가지 않는다", async () => {
    const hash = await hashPassword("plain-text-password", FAST);
    expect(hash).not.toContain("plain-text-password");
    expect(hash).not.toContain("$");
    expect(parsePasswordHash(hash)).not.toBeNull();
  });

  it("저장된 해시가 깨져 있으면 항상 false 이고 던지지 않는다", async () => {
    for (const stored of ["", "garbage", "scrypt:4096:8:1:AAAA:BBBB", "scrypt:100:8:1:AAAAAAAAAAAA:" + "B".repeat(30)]) {
      expect(await verifyPassword("anything", stored), stored).toBe(false);
    }
  });

  it("범위를 벗어난 매개변수는 해석하지 않는다", async () => {
    const hash = await hashPassword("x", FAST);
    const [, , r, p, salt, key] = hash.split(":");
    expect(parsePasswordHash(`scrypt:3000:${r}:${p}:${salt}:${key}`)).toBeNull(); // 2의 거듭제곱 아님
    expect(parsePasswordHash(`scrypt:${2 ** 20}:${r}:${p}:${salt}:${key}`)).toBeNull(); // 너무 큼
    expect(parsePasswordHash(`scrypt:4096:0:${p}:${salt}:${key}`)).toBeNull();
  });

  it("scripts/hash-admin-password.mjs 가 만든 해시를 verifyPassword 가 인식한다", async () => {
    const hash = execFileSync("node", ["scripts/hash-admin-password.mjs"], {
      input: "스크립트로-만든-비밀번호\n",
      encoding: "utf8",
    }).trim();
    expect(await verifyPassword("스크립트로-만든-비밀번호", hash)).toBe(true);
    expect(await verifyPassword("다른-비밀번호-입니다", hash)).toBe(false);
  });

  it("스크립트는 12자 미만 비밀번호를 거부한다", () => {
    expect(() =>
      execFileSync("node", ["scripts/hash-admin-password.mjs"], { input: "short\n", stdio: ["pipe", "pipe", "pipe"] }),
    ).toThrow();
  });
});
