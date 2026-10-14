import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isAdminSameOriginRequest } from "../origin";
afterEach(() => vi.unstubAllEnvs());
describe("관리자 요청 출처", () => {
  const request = (origin?: string, host?: string) => new Request("http://localhost:3107/api/admin/login", {
    headers: { ...(origin ? { origin } : {}), ...(host ? { host } : {}) },
  });
  it("실제 Host의 동일 출처도 내부 URL 호스트와 무관하게 허용한다", () => {
    expect(isAdminSameOriginRequest(request("http://127.0.0.1:3107", "127.0.0.1:3107"))).toBe(true);
  });
  it("출처 없음·다른 출처·잘못된 Host는 차단한다", () => {
    vi.stubEnv("ALLOWED_ORIGINS", "");
    for (const r of [request(undefined, "127.0.0.1:3107"), request("https://evil.example", "127.0.0.1:3107"),
      request("http://127.0.0.1:3107", "127.0.0.1:3107/path"), request("http://127.0.0.1:3107", "user@127.0.0.1:3107"),
      request("http://127.0.0.1:3107/path", "127.0.0.1:3107"), request("http://127.0.0.1:3107", "evil.example")]) {
      expect(isAdminSameOriginRequest(r)).toBe(false);
    }
    expect(isAdminSameOriginRequest(request("http://localhost:3107", "127.0.0.1:3107"))).toBe(false);
  });
});
