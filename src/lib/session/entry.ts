export type EntryAction = "create" | "resume" | "takeover" | "show_result" | "already_submitted";

export type ExistingSession = {
  status: "in_progress" | "submitted";
  tokenHash: string;
};

/**
 * 같은 과정·닉네임·휴대폰 뒷자리로 찾은 세션(existing)과 요청 쿠키 토큰의 해시로
 * 진입 방식을 정한다.
 *
 * - create            : 세션이 없으니 새로 만든다.
 * - resume            : 진행 중이고 같은 기기다. 토큰을 바꾸지 않는다.
 * - takeover          : 진행 중이지만 쿠키가 없거나 다르다. 새 토큰을 발급해 이전 기기를 무효화한다.
 * - show_result       : 제출 완료이고 같은 기기다.
 * - already_submitted : 제출 완료인데 쿠키가 없거나 다르다. 결과를 보여주지 않는다.
 */
export function decideEntry(existing: ExistingSession | null, cookieTokenHash: string | null): EntryAction {
  if (existing === null) return "create";

  const sameDevice = cookieTokenHash !== null && cookieTokenHash === existing.tokenHash;

  if (existing.status === "submitted") {
    return sameDevice ? "show_result" : "already_submitted";
  }
  return sameDevice ? "resume" : "takeover";
}
