import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), busy: vi.fn(), error: vi.fn(), index: 0 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: () => mocks.index++ === 0 ? [false, mocks.busy] : [null, mocks.error],
}));
import { LogoutButton } from "@/app/admin/LogoutButton";
beforeEach(() => { vi.clearAllMocks(); mocks.index = 0; });
afterEach(() => vi.unstubAllGlobals());
async function click() {
  const element = LogoutButton();
  const button = element.props.children[0] as ReactElement<{ onClick: () => Promise<void> }>;
  await button.props.onClick();
}
describe("로그아웃 버튼", () => {
  it("서버에서 쿠키 삭제에 성공한 뒤에만 이동한다", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await click();
    expect(fetch).toHaveBeenCalledWith("/api/admin/logout", { method: "POST" });
    expect(mocks.replace).toHaveBeenCalledWith("/admin/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it.each(["http", "network"])("%s 실패는 이동하지 않고 재시도할 수 있게 한다", async (kind) => {
    vi.stubGlobal("fetch", kind === "http" ? vi.fn().mockResolvedValue(new Response("{}", { status: 403 })) : vi.fn().mockRejectedValue(new Error("offline")));
    await click();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.busy).toHaveBeenLastCalledWith(false);
    expect(mocks.error).toHaveBeenLastCalledWith("로그아웃하지 못했어요. 다시 시도해 주세요.");
  });
});
