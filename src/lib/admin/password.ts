import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// 비밀번호 해시 형식: scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
// 구분자에 달러 기호를 쓰지 않는다. Next 가 .env 파일의 달러 기호를 변수 치환으로 해석해 값이 깨지기 때문이다.

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
export const DEFAULT_SCRYPT = { N: 32768, r: 8, p: 1 } as const;

export type ParsedPasswordHash = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const maxmemFor = (N: number, r: number, p: number) => 128 * N * r * 2 + 128 * r * p;

/** 저장된 해시 문자열을 해석한다. 형식이 틀리거나 매개변수가 비정상이면 null. */
export function parsePasswordHash(stored: string): ParsedPasswordHash | null {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const validN = Number.isInteger(N) && N >= 2 ** 12 && N <= 2 ** 17 && (N & (N - 1)) === 0;
  if (!validN || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4) {
    return null;
  }

  const base64url = /^[A-Za-z0-9_-]+$/;
  if (!base64url.test(parts[4]) || !base64url.test(parts[5])) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  if (salt.length < 8 || hash.length < 16 || hash.length > 64) return null;

  return { N, r, p, salt, hash };
}

/** 비밀번호를 해시한다. 관리자 계정을 만들 때 쓴다 (scripts/hash-admin-password.mjs 와 같은 형식). */
export async function hashPassword(
  password: string,
  params: { N: number; r: number; p: number } = DEFAULT_SCRYPT,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params.N, params.r, params.p),
  });
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

/** 비밀번호가 저장된 해시와 맞는지. 해시 형식이 틀리면 항상 false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  const actual = await scryptAsync(password, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: maxmemFor(parsed.N, parsed.r, parsed.p),
  });
  return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
}
