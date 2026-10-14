import { describe, expect, it } from "vitest";
import {
  STEP_ORDER,
  firstUnansweredGeneral,
  generalItemId,
  generalNumber,
  isStepReachable,
  nextStep,
  resolveResumeStep,
  prevStep,
} from "../progress";

const counts = (answeredGeneralCount: number, selectedAdjectiveCount = 0) => ({
  answeredGeneralCount,
  selectedAdjectiveCount,
});

describe("STEP_ORDER", () => {
  it("general-1 … general-42, part1-done, adjectives-intro, adjectives, review 순서다", () => {
    expect(STEP_ORDER).toHaveLength(46);
    expect(STEP_ORDER[0]).toBe("general-1");
    expect(STEP_ORDER[41]).toBe("general-42");
    expect(STEP_ORDER.slice(42)).toEqual(["part1-done", "adjectives-intro", "adjectives", "review"]);
  });
});

describe("nextStep / prevStep", () => {
  it("일반 문항 사이를 오간다", () => {
    expect(nextStep("general-1")).toBe("general-2");
    expect(prevStep("general-2")).toBe("general-1");
  });

  it("42번 다음은 part1-done, 그 다음은 adjectives-intro", () => {
    expect(nextStep("general-42")).toBe("part1-done");
    expect(nextStep("part1-done")).toBe("adjectives-intro");
    expect(nextStep("adjectives-intro")).toBe("adjectives");
    expect(nextStep("adjectives")).toBe("review");
    expect(prevStep("part1-done")).toBe("general-42");
  });

  it("경계에서는 null 을 돌려준다", () => {
    expect(prevStep("general-1")).toBeNull();
    expect(nextStep("review")).toBeNull();
  });

  it("알 수 없는 단계는 null", () => {
    expect(nextStep("nope")).toBeNull();
    expect(prevStep("nope")).toBeNull();
  });
});

describe("generalItemId / generalNumber", () => {
  it("번호와 id 를 변환한다", () => {
    expect(generalItemId(1)).toBe("g01");
    expect(generalItemId(42)).toBe("g42");
    expect(generalNumber("general-7")).toBe(7);
    expect(generalNumber("general-42")).toBe(42);
  });

  it("범위 밖이나 형식이 다르면 null", () => {
    for (const step of ["general-0", "general-43", "general-01", "part1-done", "general-"]) {
      expect(generalNumber(step), step).toBeNull();
    }
  });
});

describe("firstUnansweredGeneral", () => {
  it("아무것도 응답하지 않았으면 general-1", () => {
    expect(firstUnansweredGeneral(new Set())).toBe("general-1");
  });

  it("앞에서부터 처음 비어 있는 문항을 돌려준다", () => {
    expect(firstUnansweredGeneral(new Set(["g01", "g02", "g04"]))).toBe("general-3");
  });

  it("42개 모두 응답했으면 null", () => {
    const all = new Set(Array.from({ length: 42 }, (_, i) => generalItemId(i + 1)));
    expect(firstUnansweredGeneral(all)).toBeNull();
    all.delete("g42");
    expect(firstUnansweredGeneral(all)).toBe("general-42");
  });

  it("g 가 아닌 id 는 영향을 주지 않는다", () => {
    expect(firstUnansweredGeneral(new Set(["a01", "a02"]))).toBe("general-1");
  });
});

describe("isStepReachable", () => {
  it("general-N 은 응답 개수와 상관없이 허용한다", () => {
    expect(isStepReachable("general-1", counts(0))).toBe(true);
    expect(isStepReachable("general-42", counts(0))).toBe(true);
  });

  it("part1-done, adjectives-intro, adjectives 는 42개 응답 시에만 허용한다 (41/42 경계)", () => {
    for (const step of ["part1-done", "adjectives-intro", "adjectives"]) {
      expect(isStepReachable(step, counts(41)), `${step} 41`).toBe(false);
      expect(isStepReachable(step, counts(42)), `${step} 42`).toBe(true);
    }
  });

  it("review 는 42개 응답 + 형용사 5개 이상일 때만 허용한다 (4/5 경계)", () => {
    expect(isStepReachable("review", counts(42, 4))).toBe(false);
    expect(isStepReachable("review", counts(42, 5))).toBe(true);
    expect(isStepReachable("review", counts(41, 5))).toBe(false);
    expect(isStepReachable("review", counts(42, 30))).toBe(true);
  });

  it("알 수 없는 단계는 허용하지 않는다", () => {
    expect(isStepReachable("general-43", counts(42, 30))).toBe(false);
    expect(isStepReachable("result", counts(42, 30))).toBe(false);
  });
});

describe("resolveResumeStep", () => {
  const ids = (n: number) => new Set(Array.from({ length: n }, (_, i) => generalItemId(i + 1)));

  it("general-1 에 머물러 있어도 1~3 응답이 있으면 general-4", () => {
    expect(resolveResumeStep("general-1", ids(3))).toBe("general-4");
  });

  it("응답이 없으면 general-1", () => {
    expect(resolveResumeStep("general-1", new Set())).toBe("general-1");
  });

  it("42개를 모두 응답했으면 part1-done", () => {
    expect(resolveResumeStep("general-1", ids(42))).toBe("part1-done");
    expect(resolveResumeStep("general-42", ids(42))).toBe("part1-done");
  });

  it("중간이 비어 있으면 그 문항으로 돌려보낸다", () => {
    expect(resolveResumeStep("general-9", new Set(["g01", "g02", "g04", "g05"]))).toBe("general-3");
  });

  it("general 이 아닌 단계는 그대로 둔다", () => {
    for (const step of ["part1-done", "adjectives-intro", "adjectives", "review"]) {
      expect(resolveResumeStep(step, ids(3)), step).toBe(step);
      expect(resolveResumeStep(step, ids(42)), step).toBe(step);
    }
  });
});
