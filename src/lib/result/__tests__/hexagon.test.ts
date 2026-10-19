import { describe, expect, it } from "vitest";
import { classifyHexagon } from "../hexagon";
import type { RiasecType } from "../../../content/types";

const scores = (R: number, I = R, A = R, S = R, E = R, C = R): Record<RiasecType, number> => ({ R, I, A, S, E, C });

describe("흥미육각 베타 분류", () => {
  it.each([
    [scores(12, 9, 6, 3, 3, 3), "large-uneven"],
    [scores(5, 1, 0, 0, 0, 0), "small-uneven"],
    [scores(8), "large-balanced"],
    [scores(2), "small-balanced"],
    [scores(0), "small-balanced"],
    [scores(12), "large-balanced"],
  ])("네 가지 형태 및 극단값: %j → %s", (input, key) => {
    expect(classifyHexagon(input).key).toBe(key);
  });

  it("평균 6점과 범위 4점은 상위 경계에 포함한다", () => {
    expect(classifyHexagon(scores(6)).key).toBe("large-balanced");
    expect(classifyHexagon(scores(5, 6, 6, 6, 6, 6)).key).toBe("small-balanced");
    expect(classifyHexagon(scores(8, 4, 6, 6, 6, 6)).key).toBe("large-uneven");
    expect(classifyHexagon(scores(7, 4, 6, 6, 6, 7)).key).toBe("large-balanced");
  });

  it("입력·점수·순위를 수정하지 않으며 유형의 위치와 무관하다", () => {
    const input = Object.freeze(scores(12, 9, 6, 3, 3, 3));
    const copy = { ...input };
    expect(classifyHexagon(input)).toEqual(classifyHexagon(input));
    expect(input).toEqual(copy);
    expect(classifyHexagon(scores(3, 3, 3, 6, 9, 12)).key).toBe(classifyHexagon(input).key);
  });

  it("선택량에 따른 한계를 감추지 않고 실제 그래프 합계를 해석한다", () => {
    expect(classifyHexagon(scores(5)).key).toBe("small-balanced");
    expect(classifyHexagon(scores(6)).key).toBe("large-balanced");
  });

  it.each([-1, 13, NaN, Infinity, 2.5, undefined])("잘못된 점수 %s를 임의 해석하지 않는다", (value) => {
    expect(() => classifyHexagon({ ...scores(0), R: value } as Record<RiasecType, number>)).toThrow(RangeError);
  });
});
