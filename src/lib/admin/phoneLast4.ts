import "server-only";
import { getHashSecret, phoneKey } from "../security/hash";

/**
 * sessions.phone_key(휴대폰 뒷자리 4자리의 HMAC-SHA256)를 관리자 목록에서 뒷자리로 되돌린다.
 *
 * 뒷자리는 0000~9999 의 1만 가지뿐이므로, 저장 때 쓴 SESSION_HASH_SECRET 으로 1만 개를 모두 계산해
 * 역조회하면 기존 세션도 정확히 복원된다. DB 에 평문 뒷자리를 새로 저장하지 않는다.
 * 비밀키가 바뀌었거나 없으면 복원할 수 없으며, 그때는 null 을 돌려준다.
 * 관리자 인증을 통과한 서버 코드에서만 호출한다.
 */
export function buildPhoneLast4Lookup(secret: string): Map<string, string> {
  const lookup = new Map<string, string>();
  for (let n = 0; n < 10000; n++) {
    const last4 = n.toString().padStart(4, "0");
    lookup.set(phoneKey(secret, last4), last4);
  }
  return lookup;
}

// 비밀키별로 한 번만 계산한다(약 1만 번의 HMAC). 비밀키 원문은 비교용으로만 들고 있는다.
let cached: { secret: string; lookup: Map<string, string> } | null = null;

export type PhoneLast4Resolver = (phoneKeyValue: string | null | undefined) => string | null;

export function createPhoneLast4Resolver(): PhoneLast4Resolver {
  let secret: string;
  try {
    secret = getHashSecret();
  } catch {
    // 목록 자체는 보여주고 휴대폰 칸만 확인 불가로 둔다. 오류 메시지에 비밀키를 남기지 않는다.
    console.error("[admin/results] SESSION_HASH_SECRET 이 없어 휴대폰 뒷자리를 복원하지 못했습니다.");
    return () => null;
  }
  if (cached?.secret !== secret) cached = { secret, lookup: buildPhoneLast4Lookup(secret) };
  const { lookup } = cached;
  return (value) => (value ? lookup.get(value) ?? null : null);
}
