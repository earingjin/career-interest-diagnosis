import { beforeAll, describe, expect, it } from "vitest";
import { AdminConfigError, loadAdminConfig } from "../config";
import { envFor, makeConfig } from "./helpers";

let valid: Record<string, string>;

beforeAll(async () => {
  valid = envFor(await makeConfig());
});

describe("loadAdminConfig", () => {
  it("세 변수가 모두 올바르면 설정을 돌려준다", () => {
    const config = loadAdminConfig(valid);
    expect(config.id).toBe("operator");
    expect(config.sessionSecret).toHaveLength(40);
  });

  it("환경 변수가 하나도 없으면 던진다", () => {
    expect(() => loadAdminConfig({})).toThrow(AdminConfigError);
  });

  for (const name of ["ADMIN_ID", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET"]) {
    it(`${name} 이 없거나 비어 있으면 던지고, 누락된 이름만 알려 준다`, () => {
      for (const value of [undefined, "", "   "]) {
        try {
          loadAdminConfig({ ...valid, [name]: value });
          expect.unreachable("던져야 한다");
        } catch (error) {
          expect(error).toBeInstanceOf(AdminConfigError);
          expect((error as AdminConfigError).invalid).toEqual([name]);
        }
      }
    });
  }

  it("세션 비밀키가 32자 미만이면 던진다", () => {
    expect(() => loadAdminConfig({ ...valid, ADMIN_SESSION_SECRET: "x".repeat(31) })).toThrow(AdminConfigError);
    expect(() => loadAdminConfig({ ...valid, ADMIN_SESSION_SECRET: "x".repeat(32) })).not.toThrow();
  });

  it("긴 공백만으로 된 세션 비밀키도 설정 누락으로 거부한다", () => {
    expect(() => loadAdminConfig({ ...valid, ADMIN_SESSION_SECRET: " ".repeat(64) })).toThrow(AdminConfigError);
  });

  it("비밀번호 해시 형식이 틀리면 던진다", () => {
    for (const hash of ["plain-password", "scrypt:1:1:1:aa:bb", "bcrypt:x:y:z:a:b", "scrypt:32768:8:1:!!:??"]) {
      expect(() => loadAdminConfig({ ...valid, ADMIN_PASSWORD_HASH: hash }), hash).toThrow(AdminConfigError);
    }
  });

  it("오류 메시지에 비밀 값이 들어가지 않는다", () => {
    const secret = "very-secret-value-that-is-long-enough-1234";
    try {
      loadAdminConfig({ ...valid, ADMIN_SESSION_SECRET: "short", ADMIN_ID: "" });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(valid.ADMIN_PASSWORD_HASH);
      expect(message).not.toContain(secret);
      expect(message).toContain("ADMIN_ID");
    }
  });
});
