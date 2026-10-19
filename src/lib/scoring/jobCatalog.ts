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

/**
 * 대표 목록(최신 PDF 원문 → 개정판 신규 우선)을 rank 순서대로, 그다음 예비 후보(supplements, 다양성 순서)를 고른다.
 * 이미 뽑힌 직업은 1순위에서만 사용한다.
 */
export function pickCatalogJobs(
  type: RiasecType,
  catalog: JobCatalog,
  taken: TakenJobs,
  limit: number,
): JobCatalogDisplay[] {
  const sources = new Map(catalog.sources.map((source) => [source.id, source]));
  const displays = new Map(catalog.display.map((display) => [display.id, display]));
  const picked: JobCatalogDisplay[] = [];
  const ordered = [
    ...[...(catalog.representatives[type] ?? [])].sort((a, b) => a.rank - b.rank).map((entry) => entry.displayId),
    ...(catalog.supplements[type] ?? []),
  ];
  for (const displayId of ordered) {
    if (picked.length >= limit) break;
    const display = displays.get(displayId);
    const source = display && sources.get(display.sourceId);
    if (!display || !source || source.status !== "active" || source.type !== type || display.displayReview !== "approved" || display.name !== source.rawName) continue;
    const name = normalizeJobName(display.name);
    if (!name || taken.names.has(name) || taken.keys.has(display.dedupeKey)) continue;
    if (picked.some((item) => normalizeJobName(item.name) === name || item.dedupeKey === display.dedupeKey)) continue;
    picked.push(display);
  }
  return picked;
}
