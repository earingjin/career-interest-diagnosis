import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 테스트에서도 앱 코드와 같은 "@/..." 경로를 쓸 수 있게 한다 (tsconfig 의 paths 와 같음).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") },
  },
});
