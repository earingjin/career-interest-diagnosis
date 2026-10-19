import type { JobCatalog, JobCatalogDisplay, RiasecType } from "../../content/types";

export const EMPTY_JOB_CATALOG: JobCatalog = {
  version: "empty",
  reviewStatus: "empty",
  sources: [],
  display: [],
  representatives: { R: [], I: [], A: [], S: [], E: [], C: [] },
  supplements: { R: [], I: [], A: [], S: [], E: [], C: [] },
  holds: [],
};

/** 같은 직업의 공백 표기 차이만 중복으로 본다. 복합 직업명은 분해하지 않는다. */
export function normalizeJobName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, "");
}

export type TakenJobs = { names: Set<string>; keys: Set<string> };

/** PDF에 나온 유형별 순서를 유지하면서, 이미 뽑힌 직업은 1순위에서만 사용한다. */
export function pickCatalogJobs(
  type: RiasecType,
  catalog: JobCatalog,
  taken: TakenJobs,
  limit: number,
): JobCatalogDisplay[] {
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));
  const displays = new Map(catalog.display.map((display) => [display.id, display]));
  const picked: JobCatalogDisplay[] = [];
  for (const entry of [...(catalog.representatives[type] ?? [])].sort((a, b) => a.rank - b.rank)) {
    if (picked.length >= limit) break;
    const display = displays.get(entry.displayId);
    const source = display && sources.get(display.sourceId);
    if (!display || !source || source.status !== "active" || source.type !== type || display.displayReview !== "approved" || display.name !== source.rawName) continue;
    const name = normalizeJobName(display.name);
    if (!name || taken.names.has(name) || taken.keys.has(display.dedupeKey)) continue;
    if (picked.some((item) => normalizeJobName(item.name) === name || item.dedupeKey === display.dedupeKey)) continue;
    picked.push(display);
  }
  return picked;
}
