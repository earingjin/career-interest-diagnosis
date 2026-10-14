import type { AdminConfig } from "../config";
import type { AttemptStore } from "../login";
import { hashPassword } from "../password";

export const TEST_ID = "operator";
export const TEST_PASSWORD = "correct horse battery staple";
export const TEST_SECRET = "s".repeat(40);

// 테스트가 오래 걸리지 않도록 허용되는 가장 작은 비용으로 해시를 만든다.
export async function makeConfig(overrides: Partial<AdminConfig> = {}): Promise<AdminConfig> {
  return {
    id: TEST_ID,
    passwordHash: await hashPassword(TEST_PASSWORD, { N: 4096, r: 8, p: 1 }),
    sessionSecret: TEST_SECRET,
    ...overrides,
  };
}

export function envFor(config: AdminConfig): Record<string, string> {
  return {
    ADMIN_ID: config.id,
    ADMIN_PASSWORD_HASH: config.passwordHash,
    ADMIN_SESSION_SECRET: config.sessionSecret,
  };
}

/** auth_attempts 테이블을 흉내 내는 메모리 저장소 */
export function memoryStore(): AttemptStore & { rows: { key: string; at: Date }[] } {
  const rows: { key: string; at: Date }[] = [];
  return {
    rows,
    async recordFailures(keys, at) {
      for (const key of keys) rows.push({ key, at });
    },
    async countFailures(key, since) {
      return rows.filter((row) => row.key === key && row.at >= since).length;
    },
    async clearFailures(keys) {
      for (let i = rows.length - 1; i >= 0; i--) if (keys.includes(rows[i].key)) rows.splice(i, 1);
    },
  };
}
