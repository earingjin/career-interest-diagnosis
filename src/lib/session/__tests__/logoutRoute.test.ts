import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  token: "customer-token" as string | null,
  clearCookie: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/session/cookie", () => ({
  readSessionToken: async () => state.token,
  clearSessionCookie: state.clearCookie,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ from: (table: string) => {
    expect(table).toBe("sessions");
    return { update: state.update };
  } }),
}));

import { POST } from "@/app/api/session/logout/route";
import { sha256Hex } from "@/lib/security/hash";
import { decideEntry } from "../entry";

const origin = "http://localhost:3000";
const request = (from = origin) => new Request(`${origin}/api/session/logout`, { method: "POST", headers: { origin: from } });

beforeEach(() => {
  vi.clearAllMocks();
  state.token = "customer-token";
  state.eq.mockResolvedValue({ error: null });
  state.update.mockReturnValue({ eq: state.eq });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("고객 이용 종료: 기존 토큰 무효화 정책", () => {
  it("토큰 해시만 변경하고 성공 후 쿠키를 지운다", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const patch = state.update.mock.calls[0][0];
    expect(Object.keys(patch)).toEqual(["token_hash"]);
    expect(patch.token_hash).not.toBe(sha256Hex("customer-token"));
    expect(state.eq).toHaveBeenCalledWith("token_hash", sha256Hex("customer-token"));
    expect(state.clearCookie).toHaveBeenCalledOnce();
    expect(state.clearCookie.mock.invocationCallOrder[0]).toBeGreaterThan(state.eq.mock.invocationCallOrder[0]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("DB 실패 시 쿠키를 남기고 오류를 반환해 재시도를 허용한다", async () => {
    state.eq.mockResolvedValue({ error: { message: "network unavailable" } });
    expect((await POST(request())).status).toBe(500);
    expect(state.clearCookie).not.toHaveBeenCalled();
  });

  it("다른 origin의 종료 요청은 토큰에 손대지 않는다", async () => {
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.clearCookie).not.toHaveBeenCalled();
  });

  it("쿠키가 없어도 안전하게 종료한다", async () => {
    state.token = null;
    expect((await POST(request())).status).toBe(200);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.clearCookie).toHaveBeenCalledOnce();
  });

  it("무효화 후 진행 중에는 takeover, 제출 후에는 already_submitted 정책을 유지한다", async () => {
    await POST(request());
    const tokenHash = state.update.mock.calls[0][0].token_hash;
    expect(decideEntry({ status: "in_progress", tokenHash }, null)).toBe("takeover");
    expect(decideEntry({ status: "submitted", tokenHash }, null)).toBe("already_submitted");
    expect(decideEntry({ status: "submitted", tokenHash }, sha256Hex("customer-token"))).toBe("already_submitted");
    expect(decideEntry(null, null)).toBe("create");
  });
});
