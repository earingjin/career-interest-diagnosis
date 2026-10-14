import { createHash } from "node:crypto";

export type FingerprintItem = { itemId: string; value: boolean };

/**
 * 응답 목록의 지문. DB 함수 submit_session 이 같은 규칙으로 계산해 비교한다.
 *   md5(string_agg(item_id || ':' || value::text, ',' order by item_id collate "C"))
 * item_id(g01~g42, a01~a30)는 ASCII 라서 일반 문자열 비교 정렬이 collate "C" 와 같다.
 * 응답이 없으면 빈 문자열의 md5 다 (SQL 쪽은 coalesce(…, '')).
 */
export function responseFingerprint(items: FingerprintItem[]): string {
  const joined = [...items]
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
    .map((item) => `${item.itemId}:${item.value ? "true" : "false"}`)
    .join(",");
  return createHash("md5").update(joined, "utf8").digest("hex");
}
