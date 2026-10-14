import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { responseFingerprint } from "../fingerprint";

const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

describe("responseFingerprint", () => {
  it("같은 입력은 같은 값을 낸다", () => {
    const items = [
      { itemId: "g01", value: true },
      { itemId: "a03", value: true },
    ];
    expect(responseFingerprint(items)).toBe(responseFingerprint(items.map((i) => ({ ...i }))));
    expect(responseFingerprint(items)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("입력 순서가 달라도 같은 값을 낸다", () => {
    const a = [
      { itemId: "g02", value: false },
      { itemId: "a01", value: true },
      { itemId: "g01", value: true },
    ];
    expect(responseFingerprint(a)).toBe(responseFingerprint([a[2], a[0], a[1]]));
  });

  it("값 하나가 바뀌면 다른 값을 낸다", () => {
    const base = [
      { itemId: "g01", value: true },
      { itemId: "g02", value: true },
    ];
    expect(responseFingerprint(base)).not.toBe(
      responseFingerprint([base[0], { itemId: "g02", value: false }]),
    );
  });

  it("항목이 하나 더 있거나 빠지면 다른 값을 낸다", () => {
    const base = [{ itemId: "g01", value: true }];
    expect(responseFingerprint(base)).not.toBe(responseFingerprint([...base, { itemId: "a01", value: true }]));
  });

  it("SQL 과 같은 문자열 규칙: item_id 오름차순(collate C), \"id:true|false\" 를 쉼표로 연결", () => {
    const items = [
      { itemId: "g10", value: false },
      { itemId: "a30", value: true },
      { itemId: "g02", value: true },
      { itemId: "a01", value: true },
    ];
    expect(responseFingerprint(items)).toBe(md5("a01:true,a30:true,g02:true,g10:false"));
  });

  it("빈 배열은 빈 문자열의 md5 다", () => {
    expect(responseFingerprint([])).toBe(md5(""));
    expect(responseFingerprint([])).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const items = [
      { itemId: "g02", value: true },
      { itemId: "g01", value: true },
    ];
    responseFingerprint(items);
    expect(items.map((i) => i.itemId)).toEqual(["g02", "g01"]);
  });
});
