// 진입 폼의 시작하기 버튼 활성 조건. 클라이언트에서도 쓰므로 서버 전용 모듈을 import 하지 않는다.
// (닉네임 규칙은 src/lib/security/hash.ts 의 nicknameIsValid 와 같아야 하며, 테스트가 일치를 확인한다.)

const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,10}$/;
const PHONE_LAST4_PATTERN = /^[0-9]{4}$/;

/** 서버(parseEnterBody)와 같은 방식으로 정리한 닉네임: NFC 정규화 후 앞뒤 공백 제거 */
export function normalizeNickname(nickname: string): string {
  return nickname.normalize("NFC").trim();
}

/**
 * 닉네임, 휴대폰 뒷자리, 동의가 모두 맞을 때만 true.
 * 버튼의 disabled 와 제출 직전 확인이 모두 이 함수 하나를 쓴다.
 */
export function isEntryReady(nickname: string, phoneLast4: string, consent: boolean): boolean {
  const normalized = normalizeNickname(nickname);
  return (
    normalized.length >= 2 &&
    normalized.length <= 10 &&
    NICKNAME_PATTERN.test(normalized) &&
    PHONE_LAST4_PATTERN.test(phoneLast4) &&
    consent === true
  );
}
