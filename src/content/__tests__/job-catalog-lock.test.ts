import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import catalog from "../job-catalog.json";
import { JOB_CATALOG_VERSION } from "../version";

// 추천직업 카탈로그 변경 감지: 데이터가 바뀌면 이 테스트가 실패한다.
//
// 카탈로그를 고쳤다면 (대표·보충 후보·승인 상태·표시명·문구 어느 것이든)
//   1) job-catalog.json 의 version 과 src/content/version.ts 의 JOB_CATALOG_VERSION 을 같은 새 버전으로 올리고
//   2) 아래 LOCK 에 "새 버전: 새 해시" 한 줄을 **추가**한다. (이전 버전의 줄은 지우거나 고치지 않는다.)
// 해시는 이 테스트가 실패할 때 출력되는 '실제 해시' 값을 쓴다. 의미와 절차는 docs/versioning.md 에 있다.
// 아직 배포·커밋 전인 버전(현재 0.2.0)의 수정은 같은 버전 안에서 해시만 갱신해도 된다.
const LOCK: Record<string, string> = {
  "0.2.0": "7d14b1a2bb4cd0482ddf76125c4dcfef101d5206d19fad2f4bbfae214f3d6bda",
};

/** 키 순서와 들여쓰기·줄바꿈에 영향받지 않는 표준 문자열 (배열 순서는 의미가 있으므로 유지) */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const hashOf = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
// 변형 시험용으로 카탈로그를 느슨하게 다루는 최소 타입 (any 를 쓰지 않는다)
type LooseDisplay = { id: string; name: string; displayReview: string; [key: string]: unknown };
type LooseSource = { id: string; status: string; appendixRefs: { star: boolean }[] };
type Loose = {
  display: LooseDisplay[];
  sources: LooseSource[];
  representatives: Record<string, { displayId: string }[]>;
  supplements: Record<string, string[]>;
  reviewPolicy: Record<string, string>;
};

const semver = (v: string) => v.split(".").map(Number);
const compare = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

describe("job-catalog 변경 감지", () => {
  it("카탈로그 파일의 version 과 JOB_CATALOG_VERSION 이 같다", () => {
    expect(catalog.version).toBe(JOB_CATALOG_VERSION);
  });

  it("현재 버전의 해시가 기록되어 있고, 기록된 버전은 모두 semver 이며 현재 버전이 가장 높다", () => {
    expect(Object.keys(LOCK), "현재 버전의 해시를 LOCK 에 추가하세요").toContain(JOB_CATALOG_VERSION);
    const versions = Object.keys(LOCK);
    for (const v of versions) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect([...versions].sort(compare).at(-1)).toBe(JOB_CATALOG_VERSION);
  });

  it("카탈로그 내용이 기록된 해시와 같다 — 달라졌다면 버전을 올리고 LOCK 에 새 해시를 추가한다", () => {
    const actual = hashOf(catalog);
    expect(
      actual,
      `job-catalog.json 의 내용이 버전 ${JOB_CATALOG_VERSION} 에 기록된 해시와 다릅니다.\n` +
        `의도한 변경이라면 version(JSON·version.ts)을 올리고 LOCK 에 "새 버전": "${actual}" 를 추가하세요.`,
    ).toBe(LOCK[JOB_CATALOG_VERSION]);
  });

  it("해시는 표기(키 순서·들여쓰기)에는 영향받지 않고 값·배열 순서·추가 항목이 바뀌면 달라진다", () => {
    const base = hashOf(catalog);
    // 표기만 다른 같은 내용
    expect(hashOf(JSON.parse(JSON.stringify(catalog, null, 4)))).toBe(base);
    const reordered = Object.fromEntries(Object.entries(catalog).reverse());
    expect(hashOf(reordered)).toBe(base);

    const variants: Record<string, (c: Loose) => void> = {
      "대표 표시명": (c) => { c.display.find((d: LooseDisplay) => d.id === "D-R-B01")!.name += "원"; },
      "대표 순서": (c) => { const r = c.representatives.R; [r[0].displayId, r[1].displayId] = [r[1].displayId, r[0].displayId]; },
      "승인 상태": (c) => { c.display.find((d: LooseDisplay) => d.displayReview === "provisional")!.displayReview = "approved"; },
      "보충 목록 순서": (c) => { c.supplements.S.reverse(); },
      "보충 후보 추가": (c) => { c.supplements.I.push("D-I-B01"); },
      "문구": (c) => { c.reviewPolicy.note += "."; },
      "원본 상태": (c) => { c.sources.find((s: LooseSource) => s.status === "active")!.status = "hold"; },
      "★ 표시": (c) => { const ref = c.sources.find((s: LooseSource) => s.id === "E-B08")!.appendixRefs[0]; ref.star = !ref.star; },
      "필드 추가": (c) => { c.display[0].extra = 1; },
      "항목 삭제": (c) => { c.display.pop(); },
    };
    for (const [name, mutate] of Object.entries(variants)) {
      const copy = structuredClone(catalog) as unknown as Loose;
      mutate(copy);
      expect(hashOf(copy), `${name} 변경을 감지하지 못함`).not.toBe(base);
    }
  });
});
