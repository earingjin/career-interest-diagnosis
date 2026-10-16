import "server-only";
import jobCatalog from "./job-catalog.json";

// 추천직업 카탈로그 원본은 이 서버 전용 경계를 통해서만 읽는다.
export default jobCatalog;
