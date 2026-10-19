vi.mock("server-only", () => ({}));
import { describe, expect, it, vi } from "vitest";
import catalog from "../../../content/job-catalog.json";
import { RIASEC_ORDER, type JobCatalog, type RiasecType } from "../../../content/types";
import { selectJobs } from "../score";
import { normalizeJobName } from "../jobCatalog";

// 추천직업최신.pdf 1쪽의 유형별 원문 이름과 순서. 줄바꿈만 이어 붙였다.
const source: Record<RiasecType, string[]> = {
  R: ["철도건널목관리원", "고속도로 순찰요원", "교통통제요원·신호수", "운전원", "운전 기능강사", "건설현장 안전감시원", "소방시설점검원", "시설관리원(전기·설비)", "산불전문예방진화대·산림재난대응단", "가축방역·방역소독원", "공항 불법드론감시단", "주정차위반 단속원"],
  I: ["학교폭력전담조사관", "스포츠윤리센터 전문조사관", "교통사고조사원", "특별사법경찰관·특별사법경찰 자문관", "관계성범죄 모니터링 지원단", "공무상재해 입증책임 어드바이저", "금융사기 분석·예방 전문인력", "민간조사원(탐정)", "범죄예방환경설계"],
  A: ["조경관리원", "문화관광해설사", "정원·수목원 관리원", "양묘생산관리자", "ESG여행도슨트 강사", "경찰·안전 체험관 해설사", "치유농업 시설 관리원", "자서전·경찰 경험담 집필(시니어 작가)"],
  S: ["귀화면접관", "민원상담관", "학교보안관(배움터지킴이)", "교권보호관", "현장체험학습 안전지도관", "어린이집 안전관리원", "금융사기예방관·강사", "재난안전·민방위 강사", "시험감독관", "사회복무요원 복무관리 멘토", "기숙사 사감", "노숙인 상담원", "사전연명의료의향서 상담사", "생활지원사", "요양보호사", "병원동행매니저"],
  E: ["경비지도사", "청사방호요원", "보안경비원·시설경비원", "특수경비원(공항·철도)", "문화재안전경비원", "행정복지센터 보안관", "민원실 안전요원", "도시철도보안관", "시니어치안지킴이", "안심귀가보안관", "경비업체(소장·보안팀장)", "관리소장·주택관리사", "주차장관리원", "안전지킴이", "단속원", "대외협력관", "단체 사무국장"],
  C: ["공정위원(스포츠)", "법무컨설턴트", "체납관리단(체납실태조사원)", "당직전담원", "CCTV 관제센터", "수사민원담당관", "농지·현장조사원", "무단점유해소 조사원", "공공행정업무 지원", "폐기물 계근관리원"],
};

describe("최신 PDF 추천직업", () => {
  it("유형별 전체 원문 이름과 순서를 보존한다", () => {
    for (const type of RIASEC_ORDER) {
      expect(catalog.sources.filter((job) => job.type === type).map((job) => job.rawName)).toEqual(source[type]);
      expect(catalog.representatives[type].map((entry) => catalog.display.find((job) => job.id === entry.displayId)?.name)).toEqual(source[type]);
    }
  });

  it("30개 1·2순위 조합에서 PDF 이외 직업을 추천하지 않고 원문 순서를 따른다", () => {
    for (const top1 of RIASEC_ORDER) for (const top2 of RIASEC_ORDER) {
      if (top1 === top2) continue;
      const recommendations = selectJobs(top1, top2);
      expect(recommendations.map((entry) => entry.type)).toEqual([top1, top2]);
      for (const entry of recommendations) {
        expect(entry.jobs).toEqual(source[entry.type]);
        expect(entry.count).toBe(entry.jobs.length);
        expect(entry.hasMore).toBe(false);
      }
      const names = recommendations.flatMap((entry) => entry.jobs).map(normalizeJobName);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("복합 명칭을 한 항목으로 유지하며 상한을 바꿀 수 있다", () => {
    expect(selectJobs("R", "I", undefined, undefined, 9)[0].jobs).toEqual(source.R.slice(0, 9));
    expect(selectJobs("R", "I", undefined, undefined, 3)[0].jobs[2]).toBe("교통통제요원·신호수");
    expect(selectJobs("R", "I", undefined, undefined, 3)[0].hasMore).toBe(true);
    expect(selectJobs("I", "R", undefined, undefined, 4)[0].jobs[3]).toBe("특별사법경찰관·특별사법경찰 자문관");
    expect(() => selectJobs("R", "I", undefined, undefined, -1)).toThrow(RangeError);
  });

  it("카탈로그가 비거나 중복되면 기존 해설 직업으로 보충하지 않는다", () => {
    const empty = structuredClone(catalog) as unknown as JobCatalog;
    empty.representatives.R = [];
    empty.supplements.R = [];
    const legacy = Object.fromEntries(RIASEC_ORDER.map((type) => [type, { seniorJobs: ["구직업"], generalJobs: ["다른구직업"] }])) as Parameters<typeof selectJobs>[2];
    expect(selectJobs("R", "I", legacy, empty)[0]).toEqual({ type: "R", jobs: [], count: 0, hasMore: false });
    const duplicate = structuredClone(catalog) as unknown as JobCatalog;
    duplicate.display.find((job) => job.id === "I-01")!.name = "철도건널목관리원";
    expect(selectJobs("R", "I", undefined, duplicate)[1].jobs).toEqual(source.I.slice(1));
  });

  it("같은 유형은 상대 유형과 순위가 바뀌어도 동일한 목록이다", () => {
    for (const type of RIASEC_ORDER) for (const other of RIASEC_ORDER) {
      if (type === other) continue;
      expect(selectJobs(type, other)[0].jobs).toEqual(source[type]);
      expect(selectJobs(other, type)[1].jobs).toEqual(source[type]);
    }
  });
});
