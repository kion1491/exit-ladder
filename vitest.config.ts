import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/*
  테스트에서도 소스와 같은 '@/' 경로 별칭을 쓰기 위한 설정.
  (tsconfig의 paths를 그대로 읽어온다)
*/
export default defineConfig({
  plugins: [tsconfigPaths()],
});
