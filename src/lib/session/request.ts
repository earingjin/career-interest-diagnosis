import "server-only";
import { nicknameIsValid } from "../security/hash";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export const COURSE_CODE_PATTERN = /^[A-Za-z0-9_-]{16,}$/;
const PHONE_LAST4_PATTERN = /^[0-9]{4}$/;

export type EnterInput = {
  courseCode: string;
  nickname: string;
  phoneLast4: string;
};

/**
 * 상태를 바꾸는 요청(POST)에서만 호출한다. GET 에는 적용하지 않는다.
 * Origin 헤더가 없거나 요청 URL 의 origin 과 다르면 false.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RequestValidationError("요청 형식이 올바르지 않아요.");
  }
  return body as Record<string, unknown>;
}

export function parseEnterBody(body: unknown): EnterInput {
  const record = asRecord(body);

  const courseCode = record.courseCode;
  if (typeof courseCode !== "string" || !COURSE_CODE_PATTERN.test(courseCode)) {
    throw new RequestValidationError("과정 코드가 올바르지 않아요.");
  }

  // 조합 자소(ㄱ+ㅏ 분리형)를 완성형으로 합친 뒤 검증한다.
  const nickname = typeof record.nickname === "string" ? record.nickname.normalize("NFC").trim() : "";
  if (!nicknameIsValid(nickname)) {
    throw new RequestValidationError("닉네임은 한글, 영문, 숫자로 2~10자여야 해요.");
  }

  const phoneLast4 = record.phoneLast4;
  if (typeof phoneLast4 !== "string" || !PHONE_LAST4_PATTERN.test(phoneLast4)) {
    throw new RequestValidationError("휴대폰 뒷자리는 숫자 4자리여야 해요.");
  }

  if (record.consent !== true) {
    throw new RequestValidationError("개인정보 수집에 동의해야 시작할 수 있어요.");
  }

  return { courseCode, nickname, phoneLast4 };
}

const GENERAL_STEPS = Array.from({ length: 42 }, (_, i) => `general-${i + 1}`);
export const VALID_STEPS: ReadonlySet<string> = new Set([
  ...GENERAL_STEPS,
  "adjectives-intro",
  "adjectives",
  "review",
]);

export function parseStepBody(body: unknown): string {
  const step = asRecord(body).step;
  if (typeof step !== "string" || !VALID_STEPS.has(step)) {
    throw new RequestValidationError("올바르지 않은 단계예요.");
  }
  return step;
}
