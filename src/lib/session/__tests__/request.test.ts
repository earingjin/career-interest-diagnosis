import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  RequestValidationError,
  isSameOriginRequest,
  parseCourseCodeField,
  parseEnterBody,
  parseResponseBody,
  parseStepBody,
} from "../request";

const COURSE_CODE = "abcDEF0123456789_-xy";

function post(url: string, origin?: string) {
  return new Request(url, { method: "POST", headers: origin ? { origin } : {} });
}

const validBody = () => ({ courseCode: COURSE_CODE, nickname: "나무", phoneLast4: "1234", consent: true });

describe("isSameOriginRequest", () => {
  it("Origin 이 요청 URL 의 origin 과 같으면 true", () => {
    expect(isSameOriginRequest(post("https://example.com/api/session/enter", "https://example.com"))).toBe(true);
    expect(isSameOriginRequest(post("http://localhost:3000/api/session/enter", "http://localhost:3000"))).toBe(true);
  });

  it("Origin 헤더가 없으면 false", () => {
    expect(isSameOriginRequest(post("https://example.com/api/session/enter"))).toBe(false);
  });

  it("다른 도메인, 다른 포트, 다른 프로토콜의 Origin 은 false", () => {
    expect(isSameOriginRequest(post("https://example.com/x", "https://evil.example"))).toBe(false);
    expect(isSameOriginRequest(post("http://localhost:3000/x", "http://localhost:3001"))).toBe(false);
    expect(isSameOriginRequest(post("https://example.com/x", "http://example.com"))).toBe(false);
  });

  it('Origin 이 "null" 이거나 URL 이 아니면 false', () => {
    expect(isSameOriginRequest(post("https://example.com/x", "null"))).toBe(false);
    expect(isSameOriginRequest(post("https://example.com/x", "not a url"))).toBe(false);
  });
});

describe("parseEnterBody", () => {
  it("올바른 본문은 courseCode, nickname, phoneLast4 만 돌려준다", () => {
    expect(parseEnterBody(validBody())).toEqual({
      courseCode: COURSE_CODE,
      nickname: "나무",
      phoneLast4: "1234",
    });
  });

  it("조합 자쏘(분리형)는 NFC 로 합친 뒤 검증한다", () => {
    const decomposed = "나무"; // ᄂ+ᅡ+ᄆ+ᅮ → 나무
    expect(decomposed).not.toBe("나무");
    expect(decomposed.normalize("NFC")).toBe("나무");
    expect(parseEnterBody({ ...validBody(), nickname: decomposed }).nickname).toBe("나무");
  });

  it("분리형 한 글자는 합쳐져도 1자이므로 거부한다", () => {
    expect(() => parseEnterBody({ ...validBody(), nickname: "가" })).toThrow(RequestValidationError);
  });

  it("앞뒤 공백은 제거하고, 중간 공백은 거부한다", () => {
    expect(parseEnterBody({ ...validBody(), nickname: "  나무  " }).nickname).toBe("나무");
    expect(() => parseEnterBody({ ...validBody(), nickname: "나 무" })).toThrow(RequestValidationError);
  });

  it("닉네임 규칙: 1자, 11자, 특수문자는 거부하고 2~10자는 허용한다", () => {
    for (const nickname of ["가", "가".repeat(11), "나무!", "", "ㄱㅏ"]) {
      expect(() => parseEnterBody({ ...validBody(), nickname }), nickname).toThrow(/성명/);
    }
    for (const nickname of ["나무", "ab12", "가".repeat(10)]) {
      expect(parseEnterBody({ ...validBody(), nickname }).nickname).toBe(nickname);
    }
    expect(() => parseEnterBody({ ...validBody(), nickname: 1234 })).toThrow(/성명/);
  });

  it("휴대폰 뒷자리는 정확히 숫자 4자리여야 한다", () => {
    for (const phoneLast4 of ["123", "12345", "12a4", "", " 123", "1234\n", 1234]) {
      expect(() => parseEnterBody({ ...validBody(), phoneLast4 }), String(phoneLast4)).toThrow(/뒷자리/);
    }
  });

  it("동의(consent)는 정확히 true 여야 한다", () => {
    for (const consent of [false, undefined, "true", 1, null]) {
      expect(() => parseEnterBody({ ...validBody(), consent }), String(consent)).toThrow(/동의/);
    }
  });

  it("과정 코드는 [A-Za-z0-9_-] 16자 이상이어야 한다", () => {
    for (const courseCode of ["TEST01", "a".repeat(15), `${"a".repeat(15)}!`, undefined]) {
      expect(() => parseEnterBody({ ...validBody(), courseCode }), String(courseCode)).toThrow(/과정 코드/);
    }
  });

  it("객체가 아닌 본문은 거부한다", () => {
    for (const body of [undefined, null, "x", 1, []]) {
      expect(() => parseEnterBody(body)).toThrow(RequestValidationError);
    }
  });
});

describe("parseStepBody", () => {
  it("general-1 ~ general-42, adjectives-intro, adjectives, review 는 허용한다", () => {
    const steps = [
      ...Array.from({ length: 42 }, (_, i) => `general-${i + 1}`),
      "adjectives-intro",
      "adjectives",
      "review",
    ];
    for (const step of steps) expect(parseStepBody({ step })).toBe(step === "adjectives-intro" ? "adjectives" : step);
  });

  it("그 밖의 값은 거부한다", () => {
    for (const step of ["general-0", "general-43", "general-01", "result", "", undefined, 1]) {
      expect(() => parseStepBody({ step }), String(step)).toThrow(RequestValidationError);
    }
    expect(() => parseStepBody(null)).toThrow(RequestValidationError);
  });
});

describe("parseStepBody (part1-done)", () => {
  it("part1-done 을 허용한다", () => {
    expect(parseStepBody({ step: "part1-done" })).toBe("adjectives");
  });
});

describe("parseResponseBody", () => {
  const body = (over: Record<string, unknown> = {}) => ({ courseCode: COURSE_CODE, itemId: "g01", value: true, ...over });

  it("올바른 본문을 돌려준다", () => {
    expect(parseResponseBody(body())).toEqual({ courseCode: COURSE_CODE, itemId: "g01", value: true });
    expect(parseResponseBody(body({ itemId: "a30", value: false }))).toEqual({
      courseCode: COURSE_CODE,
      itemId: "a30",
      value: false,
    });
  });

  it("g01~g42, a01~a30 의 경계값을 허용한다", () => {
    for (const itemId of ["g01", "g09", "g10", "g39", "g40", "g42", "a01", "a09", "a10", "a29", "a30"]) {
      expect(parseResponseBody(body({ itemId })).itemId, itemId).toBe(itemId);
    }
  });

  it("g00, g43, a00, a31, 형식이 다른 itemId 는 400 용 오류를 던진다", () => {
    for (const itemId of ["g00", "g43", "a00", "a31", "g1", "G01", "x01", "g01 ", "", 1, null, undefined]) {
      expect(() => parseResponseBody(body({ itemId })), String(itemId)).toThrow(RequestValidationError);
    }
  });

  it("value 는 boolean 이어야 한다", () => {
    for (const value of ["true", 1, 0, null, undefined]) {
      expect(() => parseResponseBody(body({ value })), String(value)).toThrow(/응답 값/);
    }
  });

  it("과정 코드가 없거나 올바르지 않으면 거부한다", () => {
    expect(() => parseResponseBody(body({ courseCode: undefined }))).toThrow(/과정 코드/);
    expect(() => parseResponseBody(body({ courseCode: "TEST01" }))).toThrow(/과정 코드/);
  });

  it("객체가 아닌 본문은 거부한다", () => {
    for (const b of [undefined, null, "x", []]) {
      expect(() => parseResponseBody(b)).toThrow(RequestValidationError);
    }
  });
});

describe("parseCourseCodeField (제출 body)", () => {
  it("올바른 과정 코드만 있는 body 는 과정 코드를 돌려준다", () => {
    expect(parseCourseCodeField({ courseCode: COURSE_CODE })).toBe(COURSE_CODE);
  });

  it("과정 코드 외의 필드는 무시한다", () => {
    expect(parseCourseCodeField({ courseCode: COURSE_CODE, sessionId: "x", result: {} })).toBe(COURSE_CODE);
  });

  it("과정 코드가 없거나 형식이 틀리면 거부한다", () => {
    for (const courseCode of [undefined, null, "", "TEST01", "a".repeat(15), `${"a".repeat(16)}!`, 1234]) {
      expect(() => parseCourseCodeField({ courseCode }), String(courseCode)).toThrow(/과정 코드/);
    }
  });

  it("객체가 아닌 body 는 거부한다", () => {
    for (const body of [undefined, null, "x", []]) {
      expect(() => parseCourseCodeField(body)).toThrow(RequestValidationError);
    }
  });
});

describe("isSameOriginRequest (ALLOWED_ORIGINS)", () => {
  const url = "http://localhost:3000/api/session/enter";
  const phone = "http://192.168.0.10:3000";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("같은 origin → true (ALLOWED_ORIGINS 가 없어도)", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "");
    expect(isSameOriginRequest(post(url, "http://localhost:3000"))).toBe(true);
  });

  it("다른 origin, ALLOWED_ORIGINS 없음 → false", () => {
    vi.stubEnv("ALLOWED_ORIGINS", undefined);
    expect(isSameOriginRequest(post(url, phone))).toBe(false);
    vi.stubEnv("ALLOWED_ORIGINS", "");
    expect(isSameOriginRequest(post(url, phone))).toBe(false);
  });

  it("다른 origin, ALLOWED_ORIGINS 에 포함 → true", () => {
    vi.stubEnv("ALLOWED_ORIGINS", phone);
    expect(isSameOriginRequest(post(url, phone))).toBe(true);
    vi.stubEnv("ALLOWED_ORIGINS", `https://a.example, ${phone} ,https://b.example`);
    expect(isSameOriginRequest(post(url, phone))).toBe(true);
  });

  it("다른 origin, ALLOWED_ORIGINS 에 불포함 → false", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://a.example,http://192.168.0.11:3000");
    expect(isSameOriginRequest(post(url, phone))).toBe(false);
  });

  it('"*" 가 포함되어도 다른 origin 은 false', () => {
    vi.stubEnv("ALLOWED_ORIGINS", "*");
    expect(isSameOriginRequest(post(url, phone))).toBe(false);
    vi.stubEnv("ALLOWED_ORIGINS", "http://*.168.0.10:3000,*,http://192.168.*");
    expect(isSameOriginRequest(post(url, phone))).toBe(false);
  });

  it("끝의 슬래시, 공백, 대소문자가 달라도 같은 origin 으로 인정한다", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "  HTTP://192.168.0.10:3000/  ");
    expect(isSameOriginRequest(post(url, phone))).toBe(true);
    vi.stubEnv("ALLOWED_ORIGINS", "https://App.Example.com///");
    expect(isSameOriginRequest(post("https://x.example/api", "https://app.example.com"))).toBe(true);
  });

  it("부분 일치는 허용하지 않는다 (포트, 프로토콜, 접두사가 다르면 false)", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "http://192.168.0.10:3000");
    expect(isSameOriginRequest(post(url, "http://192.168.0.10:30000"))).toBe(false);
    expect(isSameOriginRequest(post(url, "https://192.168.0.10:3000"))).toBe(false);
    expect(isSameOriginRequest(post(url, "http://192.168.0.1"))).toBe(false);
    expect(isSameOriginRequest(post(url, "http://192.168.0.10:3000.evil.com"))).toBe(false);
  });

  it("Origin 헤더가 없으면 허용 목록이 있어도 false", () => {
    vi.stubEnv("ALLOWED_ORIGINS", phone);
    expect(isSameOriginRequest(post(url))).toBe(false);
  });
});
