import "server-only";
import { createServerClient } from "../supabase/server";
import type { AttemptStore } from "./login";

// 기존 auth_attempts 테이블(attempt_key, succeeded, created_at)을 그대로 쓴다. 스키마 변경은 없다.
// 기록은 service role 로만 접근한다.

function fail(context: string, error: { message: string; code?: string }): Error {
  return new Error(`DB 오류 (${context}): ${error.code ?? "-"} ${error.message}`);
}

export function createDbAttemptStore(): AttemptStore {
  const db = createServerClient();
  return {
    async recordFailures(keys, at) {
      const rows = keys.map((attempt_key) => ({
        attempt_key,
        succeeded: false,
        created_at: at.toISOString(),
      }));
      const { error } = await db.from("auth_attempts").insert(rows);
      if (error) throw fail("auth_attempts 기록", error);
    },

    async countFailures(key, since) {
      const { count, error } = await db
        .from("auth_attempts")
        .select("id", { count: "exact", head: true })
        .eq("attempt_key", key)
        .eq("succeeded", false)
        .gte("created_at", since.toISOString());
      if (error) throw fail("auth_attempts 조회", error);
      return count ?? 0;
    },

    async clearFailures(keys) {
      const { error } = await db.from("auth_attempts").delete().in("attempt_key", keys);
      if (error) throw fail("auth_attempts 삭제", error);
    },
  };
}
