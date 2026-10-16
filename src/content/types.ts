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

// ---- 퇴직경찰 추천직업 카탈로그 (job-catalog.json)
// sources: PDF 원본 직업 전체 / display: 결과 화면과 DB 에 저장하는 표시명 / representatives·supplements: 선정 대상

/** 표시명과 원본의 관계: same 원본 그대로, excerpt 복합명(또는 괄호 수식어가 붙은 명칭)에서 발췌, rename 원본 표현을 바꿈 */
export type JobNameRelation = "same" | "excerpt" | "rename";
export type JobNameKind = "job-title" | "team-program" | "activity-field";
/**
 * approved 기획 승인(대표 30개),
 * provisional 개별 검토는 마쳤지만 담당자 승인 전이라 추천에 쓰지 않는다(승인하면 approved 로 바꾼다),
 * needs-review 자동 추천에서 제외(검토 보류, 사유는 reviewCodes).
 * 추천에 쓰는 것은 approved 뿐이며, 이름 끝 글자 같은 규칙만으로는 approved 가 되지 않는다.
 */
export type JobDisplayReview = "approved" | "provisional" | "needs-review";

export type JobAppendixRef = {
  type: RiasecType;
  field: string;
  text: string;
  star: boolean;
  page: number;
  match: "same" | "part" | "similar";
};

export type JobCatalogSource = {
  id: string;
  type: RiasecType;
  rawName: string;
  origin: "body" | "appendix";
  pages: { body: number | null; appendix: number[] };
  field: string | null;
  fieldBasis: "appendix" | "proposed" | "unassigned";
  roleGroup: string | null;
  roleGroupBasis: "draft" | "none";
  status: "active" | "hold";
  appendixRefs: JobAppendixRef[];
  needsCheck: { kind: "qualification" | "selection" | "both"; confirmed: boolean } | null;
  flags: string[];
  similarTo: string[];
  conflict: {
    bodyType: RiasecType;
    bodyPage: number;
    appendixType: RiasecType;
    appendixField: string;
    appendixPage: number;
    appendixText: string;
    appendixStar: boolean;
  } | null;
};

export type JobCatalogDisplay = {
  id: string;
  sourceId: string;
  /** 결과 화면과 DB 에 저장되는 이름 */
  name: string;
  relation: JobNameRelation;
  part: number | null;
  excerptOf: string | null;
  renameFrom: string | null;
  basis: "body" | "appendix-verbatim" | "derived";
  evidence: { text: string; field: string | null; page: number; star: boolean } | null;
  appendixStar: boolean;
  nameKind: JobNameKind;
  displayReview: JobDisplayReview;
  reviewReason: string | null;
  /** 검토 근거: 기획 승인 또는 항목별 개별 검토 */
  reviewBasis: "planning-approved" | "item-review";
  nameKindBasis: "planning-approved" | "item-review";
  /** 검토 보류 사유 코드 (job-catalog.json 의 reviewPolicy 참고) */
  reviewCodes: string[];
  reviewNote?: string;
  /** 같은 원본에서 나온 표시명은 한 추천 안에 함께 쓰지 않는다. */
  dedupeKey: string;
  roleGroup: string | null;
  field: string | null;
  rank: number;
  verification: { name: "unverified" | "verified" };
  flags: string[];
  note: string | null;
};

export type JobCatalog = {
  version: string;
  reviewStatus: string;
  document?: { file: string; sha256: string; note: string };
  reviewPolicy?: Record<string, string>;
  roleGroups: Record<string, Record<string, string>>;
  diversityPolicy: Record<RiasecType, { minRoleGroups: number; minFields: number }>;
  sources: JobCatalogSource[];
  display: JobCatalogDisplay[];
  representatives: Record<RiasecType, { rank: number; displayId: string }[]>;
  supplements: Record<RiasecType, string[]>;
  holds: string[];
};
