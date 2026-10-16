import type { JobCatalog, JobCatalogDisplay, JobCatalogSource, JobDisplayReview, RiasecType } from "../../content/types";

// 추천직업 카탈로그에서 직업을 고르는 순수 함수들. 난수·시간·세션 값을 쓰지 않는다.

export const EMPTY_JOB_CATALOG: JobCatalog = {
  version: "empty",
  reviewStatus: "empty",
  roleGroups: {},
  diversityPolicy: {
    R: { minRoleGroups: 0, minFields: 0 },
    I: { minRoleGroups: 0, minFields: 0 },
    A: { minRoleGroups: 0, minFields: 0 },
    S: { minRoleGroups: 0, minFields: 0 },
    E: { minRoleGroups: 0, minFields: 0 },
    C: { minRoleGroups: 0, minFields: 0 },
  },
  sources: [],
  display: [],
  representatives: { R: [], I: [], A: [], S: [], E: [], C: [] },
  supplements: { R: [], I: [], A: [], S: [], E: [], C: [] },
  holds: [],
};

/**
 * 추천에 쓸 수 있는 검토 상태. approved(기획·담당자 승인) 만 쓴다.
 * provisional(개별 검토만 거친 후보)과 needs-review(검토 보류)는 승인 전까지 추천에 쓰지 않는다.
 * 이름이나 접미사 같은 규칙으로 이 상태를 대신 정하지 않는다.
 */
export const RECOMMENDABLE_REVIEW: ReadonlySet<JobDisplayReview> = new Set<JobDisplayReview>(["approved"]);

/** 같은 직업인지 가르는 이름 정규화: 유니코드 정규화 후 모든 공백 제거. 비슷한 이름을 같은 직업으로 합치지는 않는다. */
export function normalizeJobName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, "");
}

/** 한 번의 추천 안에서 이미 쓰인 직업 (두 유형 전체에 걸쳐 1순위가 우선). */
export type TakenJobs = { names: Set<string>; keys: Set<string> };

type CatalogIndex = { sources: Map<string, JobCatalogSource>; displays: Map<string, JobCatalogDisplay> };
const indexCache = new WeakMap<JobCatalog, CatalogIndex>();

function indexOf(catalog: JobCatalog): CatalogIndex {
  let index = indexCache.get(catalog);
  if (!index) {
    index = {
      sources: new Map(catalog.sources.map((source) => [source.id, source])),
      displays: new Map(catalog.display.map((display) => [display.id, display])),
    };
    indexCache.set(catalog, index);
  }
  return index;
}

/**
 * 한 유형의 카탈로그 추천을 고른다.
 * 1) 대표 직업을 rank 순서대로 고정 우선 선정한다. 보류·유형 불일치·승인되지 않은 표시명·중복은 건너뛴다.
 * 2) limit 에 못 미칠 때만, 승인된(approved) 보충 후보에서 고른다. 승인 대기(provisional) 후보는 쓰지 않는다. 이미 고른 직업을 기준으로
 *    같은 업무 그룹 수 → 같은 분야 수 → 지정 순서가 가장 작은 후보를 반복해서 뽑는다.
 * 기존 seniorJobs → generalJobs 보충은 호출하는 쪽(selectJobs)이 이어서 한다.
 */
export function pickCatalogJobs(
  type: RiasecType,
  catalog: JobCatalog,
  taken: TakenJobs,
  limit: number,
): JobCatalogDisplay[] {
  const { sources, displays } = indexOf(catalog);
  const picked: JobCatalogDisplay[] = [];

  const usable = (display: JobCatalogDisplay) => {
    const source = sources.get(display.sourceId);
    return source !== undefined && source.status === "active" && source.type === type && RECOMMENDABLE_REVIEW.has(display.displayReview);
  };
  const free = (display: JobCatalogDisplay) => {
    const name = normalizeJobName(display.name);
    if (name === "" || taken.names.has(name) || taken.keys.has(display.dedupeKey)) return false;
    return !picked.some((p) => normalizeJobName(p.name) === name || p.dedupeKey === display.dedupeKey);
  };

  for (const rep of [...(catalog.representatives[type] ?? [])].sort((a, b) => a.rank - b.rank)) {
    if (picked.length >= limit) break;
    const display = displays.get(rep.displayId);
    if (display && usable(display) && free(display)) picked.push(display);
  }

  if (picked.length < limit) {
    const pool = (catalog.supplements[type] ?? []).flatMap((id, order) => {
      const display = displays.get(id);
      return display ? [{ display, order }] : [];
    });
    while (picked.length < limit) {
      let best: { display: JobCatalogDisplay; order: number } | null = null;
      let bestKey: [number, number, number] = [0, 0, 0];
      for (const candidate of pool) {
        const { display } = candidate;
        if (!usable(display) || !free(display)) continue;
        const sameGroup = picked.filter((p) => p.roleGroup === display.roleGroup).length;
        const sameField = picked.filter((p) => (p.field ?? "") === (display.field ?? "")).length;
        const key: [number, number, number] = [sameGroup, sameField, candidate.order];
        const better =
          best === null ||
          key[0] < bestKey[0] ||
          (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])));
        if (better) {
          best = candidate;
          bestKey = key;
        }
      }
      if (best === null) break;
      picked.push(best.display);
    }
  }
  return picked;
}
