import "server-only";
import { nicknameIsValid } from "../security/hash";
import { LEGACY_STEPS, STEP_ORDER, normalizeStep } from "./progress";

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

// origin 비교용 정리: 앞뒤 공백과 끝의 / 를 없애고 소문자로 바꾼다. 와일드카드나 부분 일치는 쓰지 않는다.
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

/** 환경 변수 ALLOWED_ORIGINS(쉼표로 구분)에 적힌 추가 허용 origin 목록. 없으면 빈 목록. */
function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin !== "");
}

/**
 * 상태를 바꾸는 요청(POST)에서만 호출한다. GET 에는 적용하지 않는다.
 * Origin 헤더가 요청 URL 의 origin 과 같거나, ALLOWED_ORIGINS 에 정확히 적힌 값이면 true.
 * Origin 헤더가 없으면 false.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const normalized = normalizeOrigin(origin);
  try {
    if (normalized === normalizeOrigin(new URL(request.url).origin)) return true;
  } catch {
    // 요청 URL 을 해석할 수 없으면 허용 목록만 본다.
  }
  return allowedOrigins().includes(normalized);
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
    throw new RequestValidationError("성명은 한글, 영문, 숫자로 2~10자여야 해요.");
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

// 오래된 브라우저/저장 큐의 요청도 검증한 뒤 새 단계로 저장한다.
export const VALID_STEPS: ReadonlySet<string> = new Set([...STEP_ORDER, ...LEGACY_STEPS]);

export function parseStepBody(body: unknown): string {
  const step = asRecord(body).step;
  if (typeof step !== "string" || !VALID_STEPS.has(step)) {
    throw new RequestValidationError("올바르지 않은 단계예요.");
  }
  return normalizeStep(step);
}

/**
 * 쿠키 세션이 지금 보고 있는 과정의 세션인지 확인할 수 있도록, 요청마다 과정 코드를 함께 보낸다.
 * (쿠키가 곧 자격 증명이므로 보안 경계가 아니라, 다른 과정 화면에서의 오작동을 막는 용도다.)
 */
export function parseCourseCode(value: unknown): string {
  if (typeof value !== "string" || !COURSE_CODE_PATTERN.test(value)) {
    throw new RequestValidationError("과정 코드가 올바르지 않아요.");
  }
  return value;
}

export function parseCourseCodeField(body: unknown): string {
  return parseCourseCode(asRecord(body).courseCode);
}

// DB 의 responses.item_id check 와 같은 규칙: g01~g42, a01~a30
const ITEM_ID_PATTERN = /^(g(0[1-9]|[1-3][0-9]|4[0-2])|a(0[1-9]|[12][0-9]|30))$/;

export type ResponseInput = { courseCode: string; itemId: string; value: boolean };

export function parseResponseBody(body: unknown): ResponseInput {
  const record = asRecord(body);
  const courseCode = parseCourseCode(record.courseCode);

  const itemId = record.itemId;
  if (typeof itemId !== "string" || !ITEM_ID_PATTERN.test(itemId)) {
    throw new RequestValidationError("문항 번호가 올바르지 않아요.");
  }
  if (typeof record.value !== "boolean") {
    throw new RequestValidationError("응답 값이 올바르지 않아요.");
  }
  return { courseCode, itemId, value: record.value };
}
