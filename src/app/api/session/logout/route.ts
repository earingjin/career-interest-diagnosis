import { generateSessionToken, sha256Hex } from "@/lib/security/hash";
import { createServerClient } from "@/lib/supabase/server";
import { clearSessionCookie, readSessionToken } from "@/lib/session/cookie";
import { dbError } from "@/lib/session/db";
import { FORBIDDEN_ORIGIN, SERVER_ERROR, jsonResponse } from "@/lib/session/http";
import { isSameOriginRequest } from "@/lib/session/request";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return FORBIDDEN_ORIGIN();

  try {
    const token = await readSessionToken();
    if (token) {
      // 토큰을 무효 값으로 바꿔, 이 토큰은 서버에서도 더 이상 통하지 않게 한다.
      const { error } = await createServerClient()
        .from("sessions")
        .update({ token_hash: sha256Hex(`revoked:${generateSessionToken()}`) })
        .eq("token_hash", sha256Hex(token));
      if (error) throw dbError("token_hash 무효화", error);
    }
    await clearSessionCookie();
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[session/logout]", error instanceof Error ? error.message : error);
    return SERVER_ERROR();
  }
}
