import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { nicknameIsValid } from "../../security/hash";
import { isEntryReady, normalizeNickname } from "../entryForm";

describe("isEntryReady", () => {
  it("한글 2자 + 숫자 4자리 + 동의 → true", () => {
    expect(isEntryReady("나무", "1234", true)).toBe(true);
    expect(isEntryReady("ab12", "0000", true)).toBe(true);
    expect(isEntryReady("가".repeat(10), "9999", true)).toBe(true);
  });

  it("한글 1자 → false", () => {
    expect(isEntryReady("가", "1234", true)).toBe(false);
    expect(isEntryReady("", "1234", true)).toBe(false);
  });

  it("뒷자리 3자리, 5자리, 숫자 아닌 값 → false", () => {
    expect(isEntryReady("나무", "123", true)).toBe(false);
    expect(isEntryReady("나무", "12345", true)).toBe(false);
    expect(isEntryReady("나무", "12a4", true)).toBe(false);
    expect(isEntryReady("나무", "１２３４", true)).toBe(false); // 전각 숫자
  });

  it("동의 false → false", () => {
    expect(isEntryReady("나무", "1234", false)).toBe(false);
  });

  it("11자 이상이거나 특수문자·중간 공백이 있으면 false", () => {
    expect(isEntryReady("가".repeat(11), "1234", true)).toBe(false);
    expect(isEntryReady("나무!", "1234", true)).toBe(false);
    expect(isEntryReady("나 무", "1234", true)).toBe(false);
  });

  it("앞뒤 공백은 무시하고, 조합 자소(분리형)는 NFC 로 합쳐 판단한다", () => {
    expect(isEntryReady("  나무  ", "1234", true)).toBe(true);
    expect(isEntryReady("나무", "1234", true)).toBe(true); // 분리형 "나무"
    expect(isEntryReady("가", "1234", true)).toBe(false); // 합쳐도 1자
    expect(isEntryReady("  가  ", "1234", true)).toBe(false);
  });
});

describe("서버 규칙과 일치", () => {
  const samples = [
    "", "가", "나무", "ab12", "a", "가".repeat(10), "가".repeat(11), "나무!", "나 무", "ㄱㅏ", "ㅁㅁ",
    "나무\n", "나무", "한글Abc1", "😀😀", "a_b", "１２",
  ];

  it("nicknameIsValid(parseEnterBody 와 같은 정리 후) 와 닉네임 판단이 항상 같다", () => {
    for (const nickname of samples) {
      expect(isEntryReady(nickname, "1234", true), JSON.stringify(nickname)).toBe(
        nicknameIsValid(normalizeNickname(nickname)),
      );
    }
  });
});
