export class AdminListInputError extends Error {}

/** 브라우저/서버의 로컬 시간대와 관계없이 한국 기준 날짜를 반환한다. */
export function seoulToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 한국 자정 이상, 다음 한국 자정 미만. 현재 한국은 UTC+09:00이다. */
export function seoulDayRange(date: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "0001-01-01" || date > "9999-12-31") {
    throw new AdminListInputError("날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");
  }
  const midnight = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) {
    throw new AdminListInputError("존재하지 않는 날짜예요. 날짜를 다시 선택해 주세요.");
  }
  const start = midnight.getTime() - 9 * 60 * 60 * 1000;
  return { start: new Date(start).toISOString(), end: new Date(start + 86400000).toISOString() };
}

export function formatSeoulTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(iso));
}
