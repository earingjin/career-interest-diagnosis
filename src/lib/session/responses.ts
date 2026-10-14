import "server-only";
import { dbError, type Db } from "./db";
import type { ProgressCounts } from "./progress";

export type ResponsesSnapshot = {
  /** 응답한 일반성향 항목만. 예) { g01: true, g02: false } */
  general: Record<string, boolean>;
  /** 선택한 형용사 항목만, 오름차순 */
  adjectives: string[];
};

/** 세션의 저장된 응답. 화면(서버 컴포넌트)과 GET /api/session/responses 가 함께 쓴다. */
export async function getResponsesSnapshot(db: Db, sessionId: string): Promise<ResponsesSnapshot> {
  const { data, error } = await db
    .from("responses")
    .select("item_id, value")
    .eq("session_id", sessionId)
    .order("item_id", { ascending: true });
  if (error) throw dbError("responses 조회", error);

  const general: Record<string, boolean> = {};
  const adjectives: string[] = [];
  for (const row of data ?? []) {
    if (row.item_id.startsWith("g")) general[row.item_id] = row.value;
    else if (row.value === true) adjectives.push(row.item_id);
  }
  return { general, adjectives };
}

/** 응답 개수를 DB 에서 직접 센다. 클라이언트가 보낸 값은 믿지 않는다. */
export async function countProgress(db: Db, sessionId: string): Promise<ProgressCounts> {
  const count = async (prefix: "g" | "a") => {
    const { count, error } = await db
      .from("responses")
      .select("item_id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .like("item_id", `${prefix}%`);
    if (error) throw dbError("responses 개수 조회", error);
    return count ?? 0;
  };
  const [answeredGeneralCount, selectedAdjectiveCount] = await Promise.all([count("g"), count("a")]);
  return { answeredGeneralCount, selectedAdjectiveCount };
}

/**
 * 응답 하나를 저장한다.
 * - g 항목: upsert
 * - a 항목: value=true 면 upsert, false 면 행 삭제 (선택한 항목만 행으로 남긴다)
 */
export async function saveResponse(
  db: Db,
  sessionId: string,
  itemId: string,
  value: boolean,
): Promise<string> {
  const updatedAt = new Date().toISOString();

  if (itemId.startsWith("a") && !value) {
    const { error } = await db.from("responses").delete().eq("session_id", sessionId).eq("item_id", itemId);
    if (error) throw dbError("responses 삭제", error);
    return updatedAt;
  }

  const { error } = await db
    .from("responses")
    .upsert(
      { session_id: sessionId, item_id: itemId, value, updated_at: updatedAt },
      { onConflict: "session_id,item_id" },
    );
  if (error) throw dbError("responses 저장", error);
  return updatedAt;
}
