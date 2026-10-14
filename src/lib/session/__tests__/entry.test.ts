import { describe, expect, it } from "vitest";
import { decideEntry } from "../entry";

const HASH = "hash-of-this-device";
const OTHER = "hash-of-another-device";

describe("decideEntry", () => {
  it("create: 같은 과정·닉네임·뒷자리의 세션이 없으면 새로 만든다", () => {
    expect(decideEntry(null, null)).toBe("create");
    expect(decideEntry(null, HASH)).toBe("create");
  });

  it("resume: 진행 중이고 쿠키 해시가 같으면 이어간다", () => {
    expect(decideEntry({ status: "in_progress", tokenHash: HASH }, HASH)).toBe("resume");
  });

  it("takeover: 진행 중이고 쿠키 해시가 다르면 가져온다", () => {
    expect(decideEntry({ status: "in_progress", tokenHash: HASH }, OTHER)).toBe("takeover");
  });

  it("takeover: 쿠키가 null 인 진행 중 세션도 가져온다", () => {
    expect(decideEntry({ status: "in_progress", tokenHash: HASH }, null)).toBe("takeover");
  });

  it("show_result: 제출 완료이고 쿠키 해시가 같으면 결과를 보여준다", () => {
    expect(decideEntry({ status: "submitted", tokenHash: HASH }, HASH)).toBe("show_result");
  });

  it("already_submitted: 제출 완료인데 쿠키가 다르거나 없으면 결과를 보여주지 않는다", () => {
    expect(decideEntry({ status: "submitted", tokenHash: HASH }, OTHER)).toBe("already_submitted");
    expect(decideEntry({ status: "submitted", tokenHash: HASH }, null)).toBe("already_submitted");
  });
});
