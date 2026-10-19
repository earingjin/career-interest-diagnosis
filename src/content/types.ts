export type RiasecType = "R" | "I" | "A" | "S" | "E" | "C";

export const RIASEC_ORDER = ["R", "I", "A", "S", "E", "C"] as const satisfies readonly RiasecType[];

export type GeneralQuestion = {
  id: string;
  part: 1;
  type: RiasecType;
  order: number;
  text: string;
};

export type AdjectiveItem = {
  id: string;
  part: 2;
  type: RiasecType;
  order: number;
  text: string;
};

export type TypeInterpretation = {
  type: RiasecType;
  nameKo: string;
  nameEn: string;
  subtitle: string;
  interest: string;
  keywords: string[];
  workStyle: string;
  preferredActivity: string;
  workEnvironment: string;
  burdensomeActivity: string;
  careerUse: string;
  careerExplore: string;
  careerCheck: string;
  generalJobs: string[];
  seniorJobs: string[];
};

// ---- 추천직업최신.pdf에서 옮긴 서버 전용 추천직업 카탈로그
export type JobCatalogSource = {
  id: string;
  type: RiasecType;
  rawName: string;
  origin: "body";
  status: "active";
  needsCheck: { confirmed: boolean } | null;
};

export type JobCatalogDisplay = {
  id: string;
  sourceId: string;
  name: string;
  displayReview: "approved" | "provisional" | "needs-review";
  dedupeKey: string;
  rank: number;
  verification: { name: "unverified" };
};

export type JobCatalog = {
  version: string;
  reviewStatus: string;
  document?: { file: string; sha256: string; note: string };
  sources: JobCatalogSource[];
  display: JobCatalogDisplay[];
  representatives: Record<RiasecType, { rank: number; displayId: string }[]>;
  supplements: Record<RiasecType, string[]>;
  holds: string[];
};
