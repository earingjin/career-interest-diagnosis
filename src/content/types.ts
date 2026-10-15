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
