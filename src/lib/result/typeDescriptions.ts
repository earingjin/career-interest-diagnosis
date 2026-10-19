import type { RiasecType } from "../../content/types";

/** Shared verbatim copy for mobile and A4. */
export const TYPE_DESCRIPTIONS: Readonly<Record<RiasecType, string>> = {
  R: "도구나 장비를 다루고 현장에서 직접 활동하는 일을 선호합니다.",
  I: "자료를 조사하고 분석해 문제의 원인과 해결 방법을 찾는 데 관심이 있습니다.",
  A: "새로운 아이디어를 내고 자유롭게 표현하거나 창작하는 활동을 좋아합니다.",
  S: "다른 사람을 돕고 가르치거나 상담하는 활동에 관심이 있습니다.",
  E: "사람들을 이끌고 설득하며 목표를 추진하는 활동을 선호합니다.",
  C: "정해진 기준에 따라 자료와 업무를 정확하게 관리하는 일을 좋아합니다.",
};

export const TYPE_DESCRIPTIONS_TITLE = "6가지 직업흥미 유형 알아보기";
