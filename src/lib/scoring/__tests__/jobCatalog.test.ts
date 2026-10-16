vi.mock("server-only", () => ({}));
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import catalogJson from "../../../content/job-catalog.json";
import interpretations from "../../../content/interpretations.json";
import questions from "../../../content/questions.json";
import type {
  JobCatalog,
  JobCatalogDisplay,
  JobCatalogSource,
  JobDisplayReview,
  RiasecType,
  TypeInterpretation,
} from "../../../content/types";
import { JOB_CATALOG_VERSION } from "../../../content/version";
import { buildResultView } from "../../result/view";
import { EMPTY_JOB_CATALOG, normalizeJobName } from "../jobCatalog";
import { JOBS_PER_TYPE, RIASEC_ORDER, calculateScores, selectJobs, type JobSource } from "../score";

const catalog = catalogJson as unknown as JobCatalog;
const legacy = interpretations.types as unknown as Record<RiasecType, JobSource & TypeInterpretation>;
const clone = () => structuredClone(catalog);
const displayById = new Map(catalog.display.map((d) => [d.id, d]));
const sourceById = new Map(catalog.sources.map((s) => [s.id, s]));

// 기획에서 승인한 대표 추천직업 30개 (유형별 순위 순서). ID 는 정제표의 임시 ID.
const APPROVED: Record<RiasecType, [string, string][]> = {
  R: [["R-B01", "철도건널목관리원"], ["R-B04", "교통약자·장애인콜택시 운전원"], ["R-A18", "산불감시원"], ["R-B08", "건설현장 안전감시원"], ["R-B10", "시설관리원"]],
  I: [["I-B01", "학교폭력전담조사관"], ["I-B05", "관계성범죄 모니터링 지원단"], ["I-B06", "공무상재해 입증책임 어드바이저"], ["I-B04", "특별사법경찰 자문관"], ["I-B02", "스포츠윤리센터 전문조사관"]],
  A: [["A-B01", "조경관리원"], ["A-B03", "양묘생산관리자"], ["A-B04", "문화관광해설사"], ["A-B05", "ESG여행 도슨트"], ["A-B06", "경찰·안전 체험관 해설사"]],
  S: [["S-B01", "학교보안관"], ["S-B06", "금융사기예방관"], ["S-B07", "재난안전교실 강사"], ["S-B13", "민원상담관"], ["S-B18", "병원동행매니저"]],
  E: [["E-B01", "경비지도사"], ["E-B02", "청사방호요원"], ["E-B08", "안심귀가보안관"], ["E-B13", "환경감시원"], ["E-B15", "기업 대외협력관"]],
  C: [["C-B04", "당직전담원"], ["C-B05", "CCTV 관제센터요원"], ["C-B02", "체납실태조사원"], ["C-A08", "시험감독위원"], ["C-A11", "법무법인 사무장"]],
};
const RELATION: Record<string, "same" | "excerpt" | "rename"> = {
  "R-B01": "same", "R-B04": "rename", "R-A18": "same", "R-B08": "same", "R-B10": "excerpt",
  "I-B01": "same", "I-B05": "same", "I-B06": "same", "I-B04": "excerpt", "I-B02": "same",
  "A-B01": "same", "A-B03": "same", "A-B04": "same", "A-B05": "rename", "A-B06": "same",
  "S-B01": "excerpt", "S-B06": "rename", "S-B07": "rename", "S-B13": "same", "S-B18": "same",
  "E-B01": "same", "E-B02": "same", "E-B08": "excerpt", "E-B13": "excerpt", "E-B15": "same",
  "C-B04": "excerpt", "C-B05": "excerpt", "C-B02": "excerpt", "C-A08": "same", "C-A11": "same",
};
const HOLD_IDS = ["R-B13", "I-B03", "S-B02", "S-B09", "S-B10", "E-B07", "C-B06"];
const repNames = (type: RiasecType) => APPROVED[type].map(([, name]) => name);
const allPairs = RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => [a, b] as const));

// 합성 카탈로그: 알고리즘의 예외 상황을 실제 데이터와 무관하게 검증한다.
type Spec = { id: string; type: RiasecType; name: string; rg?: string; field?: string; status?: "active" | "hold"; review?: JobDisplayReview; key?: string };
function synthetic(specs: Spec[], reps: Partial<Record<RiasecType, string[]>>, supps: Partial<Record<RiasecType, string[]>> = {}): JobCatalog {
  const sources = specs.map((s) => ({ id: s.id, type: s.type, rawName: s.name, status: s.status ?? "active" }) as unknown as JobCatalogSource);
  const display = specs.map((s, i) => ({
    id: `D-${s.id}`, sourceId: s.id, name: s.name, relation: "same", displayReview: s.review ?? "approved",
    dedupeKey: s.key ?? s.id, roleGroup: s.rg ?? null, field: s.field ?? null, rank: i + 1,
  }) as unknown as JobCatalogDisplay);
  const empty = { R: [], I: [], A: [], S: [], E: [], C: [] };
  return {
    ...EMPTY_JOB_CATALOG, sources, display,
    representatives: { ...empty, ...Object.fromEntries(Object.entries(reps).map(([t, ids]) => [t, ids!.map((id, i) => ({ rank: i + 1, displayId: `D-${id}` }))])) } as JobCatalog["representatives"],
    supplements: { ...empty, ...Object.fromEntries(Object.entries(supps).map(([t, ids]) => [t, ids!.map((id) => `D-${id}`)])) } as JobCatalog["supplements"],
  };
}
const noLegacy = Object.fromEntries(RIASEC_ORDER.map((t) => [t, { seniorJobs: [], generalJobs: [] }])) as unknown as Record<RiasecType, JobSource>;

describe("job-catalog: 원본(sources)과 보류", () => {
  it("버전과 검수 상태를 갖고, PDF 해시를 기록하되 PDF 자체는 담지 않는다", () => {
    expect(catalog.version).toBe(JOB_CATALOG_VERSION);
    expect(catalog.reviewStatus).toBe("draft-needs-review");
    expect(catalog.document?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(catalog.document?.file).toBe("직업선호도_해설지_퇴직경찰개정판.pdf");
    expect(readFileSync(path.join(process.cwd(), ".gitignore"), "utf8")).toMatch(/^\/docs\/source\/\s*$/m);
  });

  it("PDF 원본 전체를 보존한다: 본문 77건(R14 I9 A8 S18 E16 C12) + 부록 전용 139건, 보류 7건", () => {
    const body = catalog.sources.filter((s) => s.origin === "body");
    expect(body).toHaveLength(77);
    expect(catalog.sources.filter((s) => s.origin === "appendix")).toHaveLength(139);
    const perType = Object.fromEntries(RIASEC_ORDER.map((t) => [t, body.filter((s) => s.type === t).length]));
    expect(perType).toEqual({ R: 14, I: 9, A: 8, S: 18, E: 16, C: 12 });
    expect(new Set(catalog.sources.map((s) => s.id)).size).toBe(catalog.sources.length);
    expect(catalog.sources.filter((s) => s.status === "hold").map((s) => s.id).sort()).toEqual([...HOLD_IDS].sort());
    expect([...catalog.holds].sort()).toEqual([...HOLD_IDS].sort());
  });

  it("본문·부록 유형 충돌 7건은 두 분류를 모두 보존하고 자동 추천에서 제외된다", () => {
    for (const id of HOLD_IDS) {
      const s = sourceById.get(id)!;
      expect(s.status, id).toBe("hold");
      expect(s.conflict, id).not.toBeNull();
      expect(s.conflict!.bodyType, id).toBe(s.type);
      expect(s.conflict!.appendixType, id).not.toBe(s.conflict!.bodyType);
      expect(s.conflict!.appendixText, id).toBe(s.rawName);
      expect(catalog.display.some((d) => d.sourceId === id), id).toBe(false);
    }
    const referenced = new Set([...Object.values(catalog.representatives).flat().map((r) => r.displayId), ...Object.values(catalog.supplements).flat()]);
    for (const id of HOLD_IDS) expect(referenced.has(`D-${id}`), id).toBe(false);
  });

  it("★ 는 원본 직업 단위로 11건만 보존되고, 안심귀가보안관에는 적용되지 않는다", () => {
    const stars = [
      ...catalog.sources.flatMap((s) => s.appendixRefs.filter((r) => r.star).map((r) => r.text)),
      ...catalog.sources.filter((s) => s.conflict?.appendixStar).map((s) => s.conflict!.appendixText),
      ...catalog.sources.filter((s) => s.origin === "appendix" && s.flags.includes("star")).map((s) => s.rawName),
    ].sort();
    expect(stars).toEqual([
      "경비지도사(상근·비상근)", "국세외수입 체납관리단", "국세체납관리단", "당직전담원(학교·관공서)", "시니어치안지킴이", "시험감독관",
      "철도건널목관리원(소장 포함)", "청사방호요원", "학교보안관", "학교폭력전담조사관", "우리동네 금융사기예방관",
    ].sort());
    const e08 = displayById.get("D-E-B08")!;
    expect(e08.appendixStar).toBe(false);
    expect(sourceById.get("E-B08")!.appendixRefs.find((r) => r.text === "시니어치안지킴이")!.star).toBe(true);
    expect(sourceById.get("E-B08")!.appendixRefs.find((r) => r.text === "안심귀가보안관")!.star).toBe(false);
  });

  it("쪽 번호는 PDF 쪽 기준(본문 1~3, 부록 5~8)이고 부록 근거는 모두 field·쪽을 갖는다", () => {
    for (const s of catalog.sources) {
      if (s.pages.body !== null) expect([1, 2, 3], s.id).toContain(s.pages.body);
      for (const p of s.pages.appendix) expect([5, 6, 7, 8], s.id).toContain(p);
      for (const r of s.appendixRefs) {
        expect(r.field, s.id).not.toBe("");
        expect([5, 6, 7, 8], s.id).toContain(r.page);
      }
    }
  });
});

describe("job-catalog: 표시명(display)", () => {
  it("활성 원본마다 표시명이 하나씩 있고 보류 원본에는 없다", () => {
    const active = catalog.sources.filter((s) => s.status === "active");
    expect(catalog.display).toHaveLength(active.length);
    for (const s of active) expect(displayById.get(`D-${s.id}`)?.sourceId, s.id).toBe(s.id);
    expect(new Set(catalog.display.map((d) => d.id)).size).toBe(catalog.display.length);
    expect(new Set(catalog.display.map((d) => normalizeJobName(d.name))).size, "표시명 중복").toBe(catalog.display.length);
    expect(new Set(catalog.display.map((d) => d.dedupeKey)).size).toBe(catalog.display.length);
  });

  it("relation 이 원본과의 관계를 정확히 나타낸다 (same/excerpt/rename)", () => {
    for (const d of catalog.display) {
      const s = sourceById.get(d.sourceId)!;
      if (d.relation === "same") {
        expect(d.name, d.id).toBe(s.rawName);
        expect(d.excerptOf, d.id).toBeNull();
      } else if (d.relation === "excerpt") {
        expect(s.rawName.includes(d.name), d.id).toBe(true);
        expect(d.name, d.id).not.toBe(s.rawName);
        expect(d.excerptOf, d.id).toBe(s.rawName);
        if (d.part !== null) expect(s.rawName.split("·")[d.part - 1], d.id).toBe(d.name);
      } else {
        expect(d.name, d.id).not.toBe(s.rawName);
        if (d.basis === "appendix-verbatim") {
          expect(d.evidence?.text, d.id).toBe(d.name);
          expect(s.appendixRefs.some((r) => r.text === d.name), d.id).toBe(true);
        } else {
          expect(d.basis, d.id).toBe("derived");
          expect(d.renameFrom && s.rawName.includes(d.renameFrom) && d.name.length < d.renameFrom.length, d.id).toBeTruthy();
        }
      }
      expect(d.dedupeKey, d.id).toBe(d.sourceId);
    }
  });

  it("보충 후보와 대표가 아닌 표시명은 연령 표현·사업단명·활동명을 자동으로 쓰지 않는다", () => {
    const reps = new Set(Object.values(catalog.representatives).flat().map((r) => r.displayId));
    const supplements = new Set(Object.values(catalog.supplements).flat());
    for (const d of catalog.display) {
      if (reps.has(d.id)) continue;
      const eligible = d.displayReview !== "needs-review";
      expect(supplements.has(d.id), d.id).toBe(eligible);
      if (/중장년|장년|고령|시니어|노년|어르신|실버|노인/.test(d.name)) expect(d.displayReview, d.id).toBe("needs-review");
      if (d.nameKind !== "job-title") expect(d.displayReview, d.id).toBe("needs-review");
      if (d.displayReview === "needs-review") expect(d.reviewReason, d.id).toBeTruthy();
    }
  });

  it("보충 후보는 모두 같은 유형의 활성·적격 항목이고 지정 순서(rank)와 목록 순서가 같다", () => {
    const repIds = new Set(Object.values(catalog.representatives).flat().map((r) => r.displayId));
    for (const type of RIASEC_ORDER) {
      const list = catalog.supplements[type].map((id) => displayById.get(id)!);
      expect(list.every(Boolean)).toBe(true);
      for (const d of list) {
        const s = sourceById.get(d.sourceId)!;
        expect(s.type, d.id).toBe(type);
        expect(s.status, d.id).toBe("active");
        expect(d.displayReview, d.id).not.toBe("needs-review");
        expect(repIds.has(d.id), d.id).toBe(false);
      }
      expect(list.map((d) => d.rank)).toEqual([...list.map((d) => d.rank)].sort((a, b) => a - b));
      const ranks = catalog.display.filter((d) => sourceById.get(d.sourceId)!.type === type).map((d) => d.rank);
      expect(new Set(ranks).size, `${type} rank 중복`).toBe(ranks.length);
    }
  });
});

describe("job-catalog: 승인된 대표 30개", () => {
  it.each(RIASEC_ORDER)("%s 유형: 승인된 5개가 승인 순서대로 ID·표시명이 일치한다", (type) => {
    const reps = catalog.representatives[type];
    expect(reps.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    reps.forEach((rep, i) => {
      const [sourceId, name] = APPROVED[type][i];
      const d = displayById.get(rep.displayId)!;
      expect(d.sourceId, `${type}${i + 1}`).toBe(sourceId);
      expect(d.name, `${type}${i + 1}`).toBe(name);
      expect(d.rank).toBe(i + 1);
      expect(d.relation, sourceId).toBe(RELATION[sourceId]);
      expect(d.displayReview, sourceId).toBe("approved");
      expect(d.verification.name, sourceId).toBe("unverified");
      expect(sourceById.get(sourceId)!.status, sourceId).toBe("active");
      expect(sourceById.get(sourceId)!.type, sourceId).toBe(type);
    });
  });

  it("대표 30개는 서로 다른 직업이고 연령 표현이 없으며 I-B05 만 사업단·조직명 확인 대상이다", () => {
    const names = RIASEC_ORDER.flatMap(repNames);
    expect(names).toHaveLength(30);
    expect(new Set(names.map(normalizeJobName)).size).toBe(30);
    for (const name of names) expect(name).not.toMatch(/중장년|장년|고령|시니어|노년|어르신|실버|노인/);
    for (const [id] of RIASEC_ORDER.flatMap((t) => APPROVED[t])) {
      const d = displayById.get(`D-${id}`)!;
      if (id === "I-B05") {
        expect(d.nameKind).toBe("team-program");
        expect(d.flags).toContain("org-or-program-name-unverified");
        expect(d.name).toBe(sourceById.get(id)!.rawName);
      } else {
        expect(d.nameKind, id).toBe("job-title");
      }
    }
  });

  it("명칭·분류 예외 처리가 요구사항대로 기록된다", () => {
    const d = (id: string) => displayById.get(`D-${id}`)!;
    expect(d("I-B04")).toMatchObject({ relation: "excerpt", part: 2, excerptOf: "특별사법경찰관·특별사법경찰 자문관", roleGroup: "Ig3" });
    expect(d("I-B04").note).toContain("같은 자격·권한으로 취급하지 않는다");
    expect(d("R-B04").evidence?.text).toBe("교통약자·장애인콜택시 운전원");
    expect(d("A-B05").evidence?.text).toBe("ESG여행 도슨트");
    expect(d("S-B07").evidence?.text).toBe("재난안전교실 강사");
    expect(d("R-B10").evidence?.text).toBe("시설관리원");
    expect(sourceById.get("R-B10")!.rawName).toBe("시설관리원(전기·설비)");
    expect(d("S-B06")).toMatchObject({ relation: "rename", renameFrom: "우리동네 금융사기예방관" });
    expect(sourceById.get("S-B06")!.rawName).toBe("우리동네 금융사기예방관·금융범죄예방 강사");
    expect(d("C-B02").roleGroup).toBe("Cg4");
    // 보류·유사 직업과 자동으로 합치지 않는다
    expect(d("C-A08").sourceId).not.toBe("S-B09");
    expect(sourceById.get("C-A08")!.similarTo).toContain("S-B09");
    expect(d("C-A11").sourceId).not.toBe("C-B07");
    expect(sourceById.get("C-A11")!.similarTo).toContain("C-B07");
    expect(displayById.has("D-S-B09")).toBe(false);
  });

  it("대표의 업무 그룹·분야 다양성이 잠정 하한을 만족한다", () => {
    expect(catalog.diversityPolicy).toEqual({
      R: { minRoleGroups: 5, minFields: 5 }, I: { minRoleGroups: 3, minFields: 1 }, A: { minRoleGroups: 3, minFields: 1 },
      S: { minRoleGroups: 5, minFields: 4 }, E: { minRoleGroups: 5, minFields: 5 }, C: { minRoleGroups: 5, minFields: 5 },
    });
    for (const type of RIASEC_ORDER) {
      const reps = catalog.representatives[type].map((r) => displayById.get(r.displayId)!);
      const groups = new Set(reps.map((d) => d.roleGroup));
      const fields = new Set(reps.map((d) => d.field));
      expect(groups.size, `${type} roleGroup`).toBeGreaterThanOrEqual(catalog.diversityPolicy[type].minRoleGroups);
      expect(fields.size, `${type} field`).toBeGreaterThanOrEqual(catalog.diversityPolicy[type].minFields);
      expect(groups.has(null) || [...groups].every((g) => g && g in catalog.roleGroups[type]), `${type} roleGroup 정의`).toBe(true);
    }
  });
});

describe("selectJobs: 대표 고정 우선 추천", () => {
  it("30개 순서 조합 모두 대표 5+5개가 승인 순서대로 나오고 count 가 실제 개수와 같다", () => {
    expect(allPairs).toHaveLength(30);
    for (const [a, b] of allPairs) {
      const recs = selectJobs(a, b);
      expect(recs.map((r) => r.type)).toEqual([a, b]);
      expect(recs[0].jobs, `${a}${b}`).toEqual(repNames(a));
      expect(recs[1].jobs, `${a}${b}`).toEqual(repNames(b));
      for (const r of recs) {
        expect(r.count).toBe(r.jobs.length);
        expect(r.count).toBe(JOBS_PER_TYPE);
      }
      expect(new Set(recs.flatMap((r) => r.jobs)).size).toBe(10);
    }
  });

  it("같은 입력은 항상 같은 결과다 (난수·시간 무관)", () => {
    const first = allPairs.map(([a, b]) => selectJobs(a, b));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      expect(allPairs.map(([a, b]) => selectJobs(a, b))).toEqual(first);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("★ 표시와 부록 수록 순서·원본 배열 순서는 대표와 보충 선정을 바꾸지 않는다", () => {
    const variant = clone();
    for (const s of variant.sources) {
      s.appendixRefs.forEach((r) => (r.star = !r.star));
      if (s.conflict) s.conflict.appendixStar = !s.conflict.appendixStar;
    }
    for (const d of variant.display) d.appendixStar = !d.appendixStar;
    variant.sources.reverse();
    variant.display.reverse();
    for (const [a, b] of allPairs) expect(selectJobs(a, b, legacy, variant)).toEqual(selectJobs(a, b));
    // 대표가 하나 빠진 보충 상황에서도 마찬가지다.
    for (const type of RIASEC_ORDER) {
      const id = catalog.representatives[type][2].displayId;
      const a = clone();
      const b = clone();
      for (const c of [a, b]) c.display.find((d) => d.id === id)!.displayReview = "needs-review";
      for (const s of b.sources) { s.appendixRefs.forEach((r) => (r.star = true)); }
      b.sources.reverse();
      const other = RIASEC_ORDER.find((t) => t !== type)!;
      expect(selectJobs(type, other, legacy, b)).toEqual(selectJobs(type, other, legacy, a));
    }
  });
});

// 보충 후보는 승인(approved)된 것만 추천에 쓰인다. 승인 대기(provisional) 후보는 쓰이지 않는다.
// 승인된 보충 후보의 선정 규칙을 확인할 때는 승인 대기 후보를 모두 승인한 사본을 쓴다.
const approveAllPending = (): JobCatalog => {
  const c = clone();
  for (const d of c.display) if (d.displayReview === "provisional") d.displayReview = "approved";
  return c;
};
const trimmedLegacy = (type: RiasecType) => [...legacy[type].seniorJobs, ...legacy[type].generalJobs].map((name) => name.trim()).filter(Boolean);
/** 기존 방식(seniorJobs → generalJobs)으로 채울 때 `taken` 에 없는 앞쪽 이름들 */
const legacyFill = (type: RiasecType, taken: string[], count: number) => {
  const used = new Set(taken.map(normalizeJobName));
  const out: string[] = [];
  for (const name of trimmedLegacy(type)) {
    if (out.length >= count) break;
    if (used.has(normalizeJobName(name))) continue;
    used.add(normalizeJobName(name));
    out.push(name);
  }
  return out;
};
const withRepReview = (c: JobCatalog, type: RiasecType, indexes: number[], review: JobDisplayReview) => {
  for (const i of indexes) c.display.find((d) => d.id === c.representatives[type][i].displayId)!.displayReview = review;
  return c;
};

describe("selectJobs: 제외·보충", () => {
  it.each(RIASEC_ORDER)("%s 유형: 대표를 하나씩 제외하면 나머지 대표를 순서대로 두고 기존 목록으로 5개를 채운다 (승인 대기 후보는 쓰지 않는다)", (type) => {
    const other = RIASEC_ORDER.find((t) => t !== type)!;
    for (let i = 0; i < 5; i++) {
      const c = withRepReview(clone(), type, [i], "needs-review");
      const recs = selectJobs(type, other, legacy, c);
      const jobs = recs[0].jobs;
      const removedName = displayById.get(catalog.representatives[type][i].displayId)!.name;
      const rest = repNames(type).filter((n) => n !== removedName);
      expect(jobs, `${type}${i + 1}`).toHaveLength(5);
      expect(jobs.slice(0, 4), `${type}${i + 1}`).toEqual(rest);
      expect(jobs).not.toContain(removedName);
      expect(recs[0].count).toBe(5);
      // 5번째는 승인 대기 후보가 아니라 기존 목록의 앞쪽 이름이다.
      expect(jobs.slice(4), `${type}${i + 1}`).toEqual(legacyFill(type, rest, 1));
      expect(recs[1].jobs, `${type}${i + 1} 2순위`).toEqual(repNames(other));
    }
  });

  it("승인 대기(provisional)·검토 보류 후보는 대표가 모두 빠져도 추천에 쓰이지 않고, 승인하면 쓰인다", () => {
    for (const type of RIASEC_ORDER) {
      const other = RIASEC_ORDER.find((t) => t !== type)!;
      const allRepsOut = withRepReview(clone(), type, [0, 1, 2, 3, 4], "needs-review");
      // 대표가 없으면 기존 목록만으로 만든 결과와 같다.
      expect(selectJobs(type, other, legacy, allRepsOut)[0], type).toEqual(selectJobs(type, other, legacy, EMPTY_JOB_CATALOG)[0]);
      // 승인 대기 후보를 승인한 사본에서는 보충 후보가 쓰인다 (승인 여부로만 정해진다).
      const approved = withRepReview(approveAllPending(), type, [0, 1, 2, 3, 4], "needs-review");
      const jobs = selectJobs(type, other, legacy, approved)[0].jobs;
      expect(jobs, type).not.toEqual(selectJobs(type, other, legacy, EMPTY_JOB_CATALOG)[0].jobs);
      // 승인된 보충 후보 수(또는 5개)만큼은 보충 후보에서, 나머지는 기존 목록에서 채운다.
      const supplementNames = catalog.supplements[type].map((id) => displayById.get(id)!.name);
      const fromSupplements = Math.min(5, supplementNames.length);
      expect(jobs.slice(0, fromSupplements).every((name) => supplementNames.includes(name)), type).toBe(true);
      expect(jobs.slice(fromSupplements), type).toEqual(legacyFill(type, jobs.slice(0, fromSupplements), 5 - fromSupplements));
    }
  });

  it("대표를 여러 개 제외하는 모든 경우(유형별 31가지)에서 결과가 결정적이고, 남은 대표 → 기존 목록 순서로 5개가 나온다", () => {
    for (const type of RIASEC_ORDER) {
      const other = RIASEC_ORDER.find((t) => t !== type)!;
      for (let mask = 1; mask < 32; mask++) {
        const out = [0, 1, 2, 3, 4].filter((i) => mask & (1 << i));
        const c = withRepReview(clone(), type, out, "needs-review");
        const first = selectJobs(type, other, legacy, c);
        expect(selectJobs(type, other, legacy, c), `${type} ${mask}`).toEqual(first);
        const rest = [0, 1, 2, 3, 4].filter((i) => !out.includes(i)).map((i) => repNames(type)[i]);
        const jobs = first[0].jobs;
        expect(jobs, `${type} ${mask}`).toHaveLength(5);
        expect(first[0].count).toBe(5);
        expect(new Set(jobs.map(normalizeJobName)).size, `${type} ${mask} 중복`).toBe(5);
        expect(jobs.slice(0, rest.length), `${type} ${mask}`).toEqual(rest);
        expect(jobs.slice(rest.length), `${type} ${mask}`).toEqual(legacyFill(type, rest, 5 - rest.length));
      }
    }
  });

  it("다른 유형 대표와 이름이 같으면 1순위가 우선하고 2순위는 그 자리를 기존 목록으로 채운다 (30개 조합 전부)", () => {
    for (const [a, b] of allPairs) {
      const c = clone();
      const dupName = repNames(a)[0];
      c.display.find((d) => d.id === c.representatives[b][0].displayId)!.name = ` ${dupName.slice(0, 2)} ${dupName.slice(2)} `; // 공백만 다른 같은 이름
      const [first, second] = selectJobs(a, b, legacy, c);
      expect(first.jobs, `${a}${b}`).toEqual(repNames(a));
      const rest = repNames(b).slice(1);
      expect(second.jobs.slice(0, 4), `${a}${b}`).toEqual(rest);
      expect(second.jobs).toHaveLength(5);
      expect(second.jobs.map(normalizeJobName)).not.toContain(normalizeJobName(dupName));
      expect(second.jobs.slice(4), `${a}${b}`).toEqual(legacyFill(b, [...rest, ...first.jobs], 1));
      expect(selectJobs(a, b, legacy, c)).toEqual([first, second]);
    }
  });

  it("이름이 달라도 같은 원본(dedupeKey)이면 1·2순위 사이에서, 같은 이름이면 한 유형 안에서도 한 번만 쓴다", () => {
    for (const [a, b] of allPairs) {
      const c = clone();
      const keyOf = (type: RiasecType, i: number) => c.display.find((d) => d.id === c.representatives[type][i].displayId)!;
      keyOf(b, 0).dedupeKey = keyOf(a, 0).dedupeKey;
      const [first, second] = selectJobs(a, b, legacy, c);
      expect(first.jobs).toEqual(repNames(a));
      expect(second.jobs.slice(0, 4), `${a}${b}`).toEqual(repNames(b).slice(1));
      expect(second.jobs).not.toContain(repNames(b)[0]);
      expect(second.jobs).toHaveLength(5);
    }
    for (const type of RIASEC_ORDER) {
      const other = RIASEC_ORDER.find((t) => t !== type)!;
      const c = clone();
      c.display.find((d) => d.id === c.representatives[type][1].displayId)!.name = repNames(type)[0];
      const jobs = selectJobs(type, other, legacy, c)[0].jobs;
      const rest = [repNames(type)[0], ...repNames(type).slice(2)];
      expect(jobs.slice(0, 4), type).toEqual(rest);
      expect(jobs, type).toHaveLength(5);
      expect(new Set(jobs.map(normalizeJobName)).size, type).toBe(5);
    }
  });

  it("승인된 보충 후보는 이미 고른 직업과 업무 그룹이 겹치지 않는 후보를 우선한다", () => {
    for (const type of RIASEC_ORDER) {
      const other = RIASEC_ORDER.find((t) => t !== type)!;
      for (let i = 0; i < 5; i++) {
        const c = withRepReview(approveAllPending(), type, [i], "needs-review");
        const jobs = selectJobs(type, other, legacy, c)[0].jobs;
        const picked = jobs.slice(0, 4).map((n) => catalog.display.find((d) => d.name === n)!.roleGroup);
        const filler = catalog.display.find((d) => d.name === jobs[4])!;
        expect(catalog.supplements[type], `${type}${i + 1} 보충`).toContain(filler.id);
        const removed = catalog.representatives[type][i].displayId;
        const candidates = catalog.supplements[type].map((id) => displayById.get(id)!).filter((d) => !jobs.slice(0, 4).includes(d.name) && d.id !== removed);
        const unseen = candidates.filter((d) => !picked.includes(d.roleGroup));
        if (unseen.length > 0) expect(picked, `${type}${i + 1}`).not.toContain(filler.roleGroup);
        const fieldCount = (field: string | null) => jobs.slice(0, 4).filter((n) => catalog.display.find((x) => x.name === n)!.field === field).length;
        const sameKey = (d: JobCatalogDisplay) => picked.filter((g) => g === d.roleGroup).length === picked.filter((g) => g === filler.roleGroup).length && fieldCount(d.field) === fieldCount(filler.field);
        const earlier = candidates.filter((d) => sameKey(d) && catalog.supplements[type].indexOf(d.id) < catalog.supplements[type].indexOf(filler.id));
        expect(earlier, `${type}${i + 1}`).toHaveLength(0);
      }
    }
  });

  it("보류 원본·유형 불일치·승인 전(provisional)·검토 보류 항목은 대표든 보충이든 자동 추천에서 제외된다", () => {
    const cat = synthetic(
      [
        { id: "R1", type: "R", name: "대표하나" },
        { id: "R2", type: "R", name: "보류대표", status: "hold" },
        { id: "R3", type: "R", name: "미승인대표", review: "needs-review" },
        { id: "I1", type: "I", name: "유형다름대표" },
        { id: "R4", type: "R", name: "대표다섯" },
        { id: "R8", type: "R", name: "승인대기대표", review: "provisional" },
        { id: "R5", type: "R", name: "보충가" },
        { id: "R6", type: "R", name: "미승인보충", review: "needs-review" },
        { id: "R7", type: "R", name: "보류보충", status: "hold" },
        { id: "R9", type: "R", name: "승인대기보충", review: "provisional" },
      ],
      { R: ["R1", "R2", "R3", "I1", "R8", "R4"] },
      { R: ["R6", "R7", "R9", "R5"] },
    );
    expect(selectJobs("R", "I", noLegacy, cat)[0].jobs).toEqual(["대표하나", "대표다섯", "보충가"]);
  });

  it("1·2순위 사이 중복은 1순위가 우선하고 2순위는 승인된 보충으로 채운다 (공백이 달라도 같은 직업)", () => {
    const cat = synthetic(
      [
        { id: "R1", type: "R", name: "시설관리원" }, { id: "R2", type: "R", name: "철도관리원" },
        { id: "I1", type: "I", name: "시설 관리원" }, { id: "I2", type: "I", name: "조사원" }, { id: "I3", type: "I", name: "분석원" },
      ],
      { R: ["R1", "R2"], I: ["I1", "I2"] },
      { I: ["I3"] },
    );
    const [first, second] = selectJobs("R", "I", noLegacy, cat);
    expect(first.jobs).toEqual(["시설관리원", "철도관리원"]);
    expect(second.jobs).toEqual(["조사원", "분석원"]);
    // 순서를 바꾸면 이번에는 I 가 1순위
    expect(selectJobs("I", "R", noLegacy, cat)[0].jobs).toEqual(["시설 관리원", "조사원", "분석원"]);
    expect(selectJobs("I", "R", noLegacy, cat)[1].jobs).toEqual(["철도관리원"]);
  });

  it("같은 원본에서 나온 표시명(dedupeKey)은 한 유형 안에서 한 번만 쓴다", () => {
    const cat = synthetic(
      [{ id: "S1", type: "S", name: "교통통제요원", key: "K" }, { id: "S2", type: "S", name: "신호수", key: "K" }, { id: "S3", type: "S", name: "상담원" }],
      { S: ["S1", "S2", "S3"] },
    );
    expect(selectJobs("S", "R", noLegacy, cat)[0].jobs).toEqual(["교통통제요원", "상담원"]);
  });

  it("이름이 달라도 같은 원본(dedupeKey)이면 1·2순위 사이에서 한 번만 쓴다 (1순위 우선)", () => {
    const cat = synthetic(
      [
        { id: "R1", type: "R", name: "교통통제요원", key: "SAME" }, { id: "R2", type: "R", name: "순찰요원" },
        { id: "I1", type: "I", name: "신호수", key: "SAME" }, { id: "I2", type: "I", name: "조사원" },
      ],
      { R: ["R1", "R2"], I: ["I1", "I2"] },
    );
    const [first, second] = selectJobs("R", "I", noLegacy, cat);
    expect(first.jobs).toEqual(["교통통제요원", "순찰요원"]);
    expect(second.jobs).toEqual(["조사원"]);
  });

  it("승인된 보충 후보 선택은 업무 그룹 → 분야 → 지정 순서로 결정된다", () => {
    const cat = synthetic(
      [
        { id: "A1", type: "A", name: "가", rg: "g1", field: "f1" },
        { id: "A2", type: "A", name: "나", rg: "g1", field: "f2" },
        { id: "A3", type: "A", name: "다", rg: "g2", field: "f1" },
        { id: "A4", type: "A", name: "라", rg: "g2", field: "f2" },
        { id: "A5", type: "A", name: "마", rg: "g3", field: "f1" },
        { id: "A6", type: "A", name: "바", rg: "g1", field: "f3" },
      ],
      { A: ["A1"] },
      { A: ["A2", "A3", "A4", "A5", "A6"] },
    );
    // 이미 고른 g1·f1 과 그룹이 겹치지 않는 다·라·마 중 분야가 겹치지 않는 "라"를 먼저 고르고, 다음은 새 그룹 "마".
    const jobs = selectJobs("A", "R", noLegacy, cat)[0].jobs;
    expect(jobs.slice(0, 3)).toEqual(["가", "라", "마"]);
    expect(jobs).toHaveLength(5);
    expect(new Set(jobs).size).toBe(5);
  });

  it("대표·승인된 보충이 부족하면 기존 seniorJobs → generalJobs 로 채우고, 거기서도 부족하면 채운 만큼만 돌려준다", () => {
    const cat = synthetic([{ id: "R1", type: "R", name: "대표" }, { id: "R2", type: "R", name: "보충" }], { R: ["R1"] }, { R: ["R2"] });
    const source = { ...noLegacy, R: { seniorJobs: ["보충", " 기존1 ", "대표"], generalJobs: ["기존 1", "기존2", "기존3", "기존4"] } };
    const [first] = selectJobs("R", "I", source, cat);
    expect(first.jobs).toEqual(["대표", "보충", "기존1", "기존2", "기존3"]);
    const short = { ...noLegacy, R: { seniorJobs: ["기존1"], generalJobs: [] } };
    expect(selectJobs("R", "I", short, cat)[0]).toEqual({ type: "R", jobs: ["대표", "보충", "기존1"], count: 3 });
  });

  it("카탈로그가 비어 있으면 기존 방식으로만 동작한다", () => {
    const [first] = selectJobs("R", "I", legacy, EMPTY_JOB_CATALOG);
    expect(first.jobs).toEqual(legacy.R.seniorJobs.slice(0, 5));
  });
});

describe("선정 결과 골든 파일 (30개 순서 조합)", () => {
  const goldenPath = path.join(__dirname, "__fixtures__", "jobs-30.json");
  const current = Object.fromEntries(allPairs.map(([a, b]) => [`${a}${b}`, selectJobs(a, b)]));
  // 검증 스크립트(verify-admin-detail, measure-sheet-fill)가 같은 결과를 쓰도록 하는 단일 출처다.
  // 의도적으로 추천 결과가 바뀔 때만 UPDATE_JOB_GOLDEN=1 로 다시 만든다.
  if (process.env.UPDATE_JOB_GOLDEN === "1") writeFileSync(goldenPath, JSON.stringify(current, null, 1) + "\n");

  it("골든 파일과 같다", () => {
    expect(existsSync(goldenPath)).toBe(true);
    expect(JSON.parse(readFileSync(goldenPath, "utf8"))).toEqual(current);
  });
});

describe("기존 기능 보존", () => {
  it("calculateScores 의 추천직업은 1·2순위의 대표 직업이고 채점 결과는 그대로다", () => {
    const general = Object.fromEntries(questions.general.map((q) => [q.id, q.type === "S" || q.type === "E"]));
    const adjectives = questions.adjectives.filter((a) => a.type === "S").slice(0, 3).map((a) => a.id)
      .concat(questions.adjectives.filter((a) => a.type === "E").slice(0, 2).map((a) => a.id));
    const result = calculateScores(general, adjectives);
    expect([result.top1, result.top2]).toEqual(["S", "E"]);
    expect(result.totals).toEqual({ R: 0, I: 0, A: 0, S: 10, E: 9, C: 0 });
    expect(result.jobRecommendations).toEqual([
      { type: "S", jobs: repNames("S"), count: 5 },
      { type: "E", jobs: repNames("E"), count: 5 },
    ]);
  });

  it("기존 목록(interpretations.json)의 직업 배열은 그대로 남아 폴백으로 쓰인다", () => {
    for (const type of RIASEC_ORDER) {
      expect(legacy[type].seniorJobs.length).toBeGreaterThan(0);
      expect(legacy[type].generalJobs.length).toBeGreaterThan(0);
    }
  });

  it("과거에 저장된 추천직업(예전 목록)은 카탈로그와 무관하게 그대로 표시된다", () => {
    const old = { S: ["가정봉사원", "간병인", "결혼상담원(커플매니저)", "교통지도원", "기숙사 사감"], E: ["건널목관리원", "검수원", "경비원(건물 관리원)", "공원관리인", "매장감시원"] };
    const scores = { R: 0, I: 0, A: 0, S: 7, E: 6, C: 0 };
    const details = Object.fromEntries(RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => [a + b, { together: "a", connect: "b", balance: "c" }])));
    const combined = Object.fromEntries(RIASEC_ORDER.flatMap((a) => RIASEC_ORDER.filter((b) => b !== a).map((b) => [a + b, { summary: "a", explanation: "b", exploration: "c" }])));
    const view = buildResultView({
      result: {
        scoring_version: "1.0.0", general_scores: scores, adjective_scores: { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 }, totals: scores, top1: "S", top2: "E",
        job_recommendations: [{ type: "S", jobs: old.S, count: 5 }, { type: "E", jobs: old.E, count: 5 }],
      },
      nickname: "과거", courseName: "과정", submittedAt: "2026-10-14T03:00:00.000Z",
      interpretations: interpretations as never, combinedInterpretations: { combinations: combined } as never, combinedDetails: { combinations: details } as never,
    });
    expect(view.top1.jobs).toEqual(old.S);
    expect(view.top2.jobs).toEqual(old.E);
  });
});

// ---- 보충 후보 개별 검토 (이름 끝 글자 같은 규칙만으로 추천 가능 여부를 정하지 않는다)
describe("job-catalog: 보충 후보 개별 검토", () => {
  const byReview = (review: JobDisplayReview) => catalog.display.filter((d) => d.displayReview === review);
  const reps = new Set(Object.values(catalog.representatives).flat().map((r) => r.displayId));
  // 개별 검토에서 보류한 35건(연령 표현·사업단명·활동 명칭으로 걸러진 63건과 별도)
  const HELD_BY_ITEM_REVIEW = [
    "C-A10", "C-B07", "E-A03", "E-A04", "E-A08", "E-A11", "E-A14", "E-A21", "E-A37", "E-A45", "E-A46", "E-A47", "E-A48", "E-A49", "E-A50", "E-B09",
    "I-B07", "R-A13", "R-A15", "R-A21", "R-A27", "R-A28", "R-A29", "R-A37", "R-B14", "S-A03", "S-A04", "S-A05", "S-A06", "S-A09", "S-A12", "S-A18",
    "S-A19", "S-A27", "S-A30",
  ];
  const PROVISIONAL_SHA256 = "c1561292dc11d030ebf53e8e7c43d936a783e2d072e96c42638f0515669748a8";

  it("검토 상태 분포: 대표 30(approved), 승인 대기 81(provisional), 검토 보류 98(needs-review)", () => {
    expect(byReview("approved")).toHaveLength(30);
    expect(byReview("provisional")).toHaveLength(81);
    expect(byReview("needs-review")).toHaveLength(98);
    expect(catalog.display).toHaveLength(209);
  });

  it("대표는 기획 승인, 나머지는 모두 항목별 개별 검토(item-review)를 거쳤다", () => {
    for (const d of catalog.display) {
      if (reps.has(d.id)) {
        expect(d.reviewBasis, d.id).toBe("planning-approved");
        expect(d.nameKindBasis, d.id).toBe("planning-approved");
      } else {
        expect(d.reviewBasis, d.id).toBe("item-review");
        expect(d.nameKindBasis, d.id).toBe("item-review");
      }
    }
    expect(Object.keys(catalog.reviewPolicy ?? {}).sort()).toEqual(["approved", "needs-review", "note", "provisional"]);
  });

  it("승인 대기(provisional) 후보는 원본 표기 그대로의 직무명이고 연령 표현·활동명·사업단명·보류 사유가 없다", () => {
    for (const d of byReview("provisional")) {
      const s = sourceById.get(d.sourceId)!;
      expect(s.status, d.id).toBe("active");
      expect(d.relation, d.id).toBe("same");
      expect(d.name, d.id).toBe(s.rawName);
      expect(d.nameKind, d.id).toBe("job-title");
      expect(d.name, d.id).not.toMatch(/중장년|장년|고령|시니어|노년|어르신|실버|노인/);
      expect(d.reviewCodes, d.id).toEqual([]);
      expect(d.reviewNote, d.id).toBeTruthy();
      expect(d.name.length, d.id).toBeLessThanOrEqual(25);
    }
  });

  it("검토 보류(needs-review)는 모두 사유 코드와 설명을 갖는다", () => {
    for (const d of byReview("needs-review")) {
      expect(d.reviewCodes.length, d.id).toBeGreaterThan(0);
      expect(d.reviewReason, d.id).toBeTruthy();
    }
    for (const sourceId of HELD_BY_ITEM_REVIEW) {
      const d = displayById.get(`D-${sourceId}`)!;
      expect(d.displayReview, sourceId).toBe("needs-review");
      expect(d.reviewCodes.length, sourceId).toBeGreaterThan(0);
    }
    expect(HELD_BY_ITEM_REVIEW).toHaveLength(35);
  });

  it("보충 후보 목록은 승인 대기(provisional) 항목만이고 지정 순서(rank)를 따른다", () => {
    for (const type of RIASEC_ORDER) {
      const expected = catalog.display
        .filter((d) => d.displayReview === "provisional" && sourceById.get(d.sourceId)!.type === type)
        .sort((a, b) => a.rank - b.rank)
        .map((d) => d.id);
      expect(catalog.supplements[type], type).toEqual(expected);
    }
  });

  it("승인 대기 후보 목록이 바뀌면 이 테스트가 실패한다 (항목 추가·제거는 개별 검토 후 의도적으로 갱신)", async () => {
    const { createHash } = await import("node:crypto");
    const ids = byReview("provisional").map((d) => d.id).sort();
    expect(createHash("sha256").update(ids.join("\n")).digest("hex")).toBe(PROVISIONAL_SHA256);
  });

  it("이름이 직책처럼 보이더라도 개별 검토에서 보류한 항목은 추천에 쓰이지 않는다", () => {
    for (const name of ["학감", "ASF수색원", "부원장", "총무이사", "부사장", "(사)경비협회 사무총장", "전기기사·기전기사·설비기사", "경비실무관(호국원)", "북촌보안관"]) {
      const d = catalog.display.find((x) => x.name === name);
      if (!d) continue;
      expect(d.displayReview, name).toBe("needs-review");
      expect(catalog.supplements[sourceById.get(d.sourceId)!.type], name).not.toContain(d.id);
    }
    // nameKind 를 직책으로 바꿔 놓아도(규칙 결과를 흉내) displayReview 가 보류이면 대표가 빠진 자리에 쓰이지 않는다.
    for (const type of RIASEC_ORDER) {
      const other = RIASEC_ORDER.find((t) => t !== type)!;
      const c = clone();
      for (const d of c.display) {
        d.nameKind = "job-title";
        if (d.displayReview === "needs-review") d.reviewCodes = [];
      }
      c.display.find((d) => d.id === c.representatives[type][0].displayId)!.displayReview = "needs-review";
      const jobs = selectJobs(type, other, legacy, c)[0].jobs;
      for (const job of jobs) {
        const d = catalog.display.find((x) => x.name === job);
        if (d) expect(["approved", "provisional"], `${type} ${job}`).toContain(d.displayReview);
      }
    }
  });

  it("유형별 임시 사용 후보가 있어 대표 하나가 빠져도 카탈로그만으로 5개를 채운다", () => {
    for (const type of RIASEC_ORDER) {
      expect(catalog.supplements[type].length, type).toBeGreaterThanOrEqual(1);
    }
  });
});
