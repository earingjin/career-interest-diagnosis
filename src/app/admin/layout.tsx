import type { Metadata } from "next";
import type { ReactNode } from "react";

// 관리자 영역은 검색에 노출하지 않는다.
export const metadata: Metadata = {
  title: "관리자",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
