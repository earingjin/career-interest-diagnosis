import "server-only";
import { createServerClient } from "../supabase/server";
import { requireAdmin } from "./guard";
import { AdminListInputError, seoulDayRange, seoulToday } from "./date";
import { RIASEC_ORDER, type RiasecType } from "../../content/types";
import { createPhoneLast4Resolver } from "./phoneLast4";

export const RESULTS_PAGE_SIZE = 50;
type SearchParams = Record<string, string | string[] | undefined>;
type Cursor = { submittedAt: string; id: string };
export type ResultsFilter = {
  date: string;
  start: string;
  end: string;
  direction: "after" | "before" | null;
  cursor: Cursor | null;
};
export type AdminResultItem = {
  id: string;
  nickname: string;
  /** 진단 시작 때 입력한 휴대폰 뒷자리 4자리. 복원할 수 없으면 null. phone_key 원값은 담지 않는다. */
  phoneLast4: string | null;
  submittedAt: string;
  top1: RiasecType | null;
  top2: RiasecType | null;
  error: string | null;
};
type JoinedRow = {
  id: string; nickname: string; phone_key: string | null; submitted_at: string;
  courses: { name: string } | { name: string }[] | null;
  results: { top1: string; top2: string } | { top1: string; top2: string }[] | null;
};

function singleParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) throw new AdminListInputError("조회 조건을 하나씩만 지정해 주세요.");
  return value;
}

export function encodeResultCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function parseResultsFilter(params: SearchParams, now = new Date()): ResultsFilter {
  const date = singleParam(params, "date") ?? seoulToday(now);
  const range = seoulDayRange(date);
  const after = singleParam(params, "after");
  const before = singleParam(params, "before");
  if (after !== undefined && before !== undefined) throw new AdminListInputError("페이지 이동 조건이 올바르지 않아요.");
  const encoded = after ?? before;
  let cursor: Cursor | null = null;
  if (encoded !== undefined) {
    try {
      if (!/^[A-Za-z0-9_-]{1,512}$/.test(encoded)) throw new Error();
      const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      // DB의 마이크로초를 보존한다. ISO 문자열을 Date로 재직렬화하면 같은 시각의 행을 놓칠 수 있다.
      if (typeof value?.submittedAt !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.submittedAt) ||
          typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id)) throw new Error();
      const time = Date.parse(value.submittedAt);
      if (!Number.isFinite(time) || time < Date.parse(range.start) || time >= Date.parse(range.end)) throw new Error();
      cursor = { submittedAt: value.submittedAt, id: value.id };
    } catch {
      throw new AdminListInputError("페이지 정보가 올바르지 않아요. 날짜를 다시 선택해 주세요.");
    }
  }
  return { date, ...range, direction: encoded === undefined ? null : after !== undefined ? "after" : "before", cursor };
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

const isType = (value: string): value is RiasecType => (RIASEC_ORDER as readonly string[]).includes(value);

/** 모든 호출에서 조회 직전 인증한다. 고객 쿠키나 proxy 통과 여부만으로 허용하지 않는다. */
export async function loadAdminResults(params: SearchParams) {
  await requireAdmin();
  const filter = parseResultsFilter(params);
  const ascending = filter.direction === "before";
  let query = createServerClient().from("sessions")
    .select("id, nickname, phone_key, submitted_at, courses(name), results(top1, top2)")
    .eq("status", "submitted")
    .gte("submitted_at", filter.start).lt("submitted_at", filter.end)
    .order("submitted_at", { ascending }).order("id", { ascending })
    .limit(RESULTS_PAGE_SIZE + 1);
  if (filter.cursor) {
    const op = ascending ? "gt" : "lt";
    const { submittedAt, id } = filter.cursor;
    query = query.or(`submitted_at.${op}.${submittedAt},and(submitted_at.eq.${submittedAt},id.${op}.${id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`관리자 결과 목록 조회 실패: ${error.code ?? "DB_ERROR"}`);
  const raw = (data ?? []) as unknown as JoinedRow[];
  const more = raw.length > RESULTS_PAGE_SIZE;
  const rows = raw.slice(0, RESULTS_PAGE_SIZE);
  if (ascending) rows.reverse();
  const resolvePhone = createPhoneLast4Resolver();
  const items: AdminResultItem[] = rows.map((row) => {
    const course = one(row.courses);
    const result = one(row.results);
    const valid = result && isType(result.top1) && isType(result.top2) && result.top1 !== result.top2;
    return {
      id: row.id, nickname: row.nickname, phoneLast4: resolvePhone(row.phone_key),
      submittedAt: row.submitted_at,
      top1: valid ? result.top1 as RiasecType : null, top2: valid ? result.top2 as RiasecType : null,
      error: !result ? "결과 없음 · 확인 필요" : !valid ? "결과 유형 오류 · 확인 필요" : !course ? "과정 정보 없음 · 확인 필요" : null,
    };
  });
  const cursorFor = (row: AdminResultItem) => encodeResultCursor({ id: row.id, submittedAt: row.submittedAt });
  return {
    date: filter.date, items,
    previous: items.length && (ascending ? more : filter.direction === "after") ? cursorFor(items[0]) : null,
    next: items.length && (ascending ? true : more) ? cursorFor(items[items.length - 1]) : null,
  };
}
