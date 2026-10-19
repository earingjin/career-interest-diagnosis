vi.mock("server-only", () => ({}));
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import catalog from "../../../content/job-catalog.json";
import { RIASEC_ORDER, type JobCatalog, type RiasecType } from "../../../content/types";
import { JOBS_PER_TYPE, selectJobs } from "../score";
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

// 퇴직경찰_추천직업_통합후보_2차정밀검토.xlsx(전체 검토표)의 '신규 우선' 16개. 개정판 원문 이름, 검토표 순서.
const priority: Record<RiasecType, string[]> = {
  R: ["유기동물구조관리", "소방안전관리자", "농기계 임대·정비"],
  I: [],
  A: [],
  S: ["경찰행정·경호학 강사(특임교수)", "교화프로그램 강사", "진로상담사", "시니어 서민주거보증 상담사", "정신병원 보호사", "금연지도원·금연단속원", "EPS현장매니저"],
  E: ["경비신임교육강사", "물놀이안전요원", "사대안전관리", "정책보좌관", "감사직"],
  C: ["불법경마단속원"],
};

// 같은 검토표의 '신규 후순위' 30개. 최신·신규 우선에 없는 직업군을 먼저, 이미 있는 직업군을 뒤에 둔 다양성 순서.
const reserve: Record<RiasecType, string[]> = {
  R: ["역사내안전관리원", "과적차량단속", "운전학원 행정실장", "산림관리원", "산림병해충예찰방제", "수소충전소 운영관리", "체육시설·캠핑장·숙박시설 관리", "환경미화", "작물·종자관리", "자율주행차량 안전운전원", "노동안전지킴이"],
  I: [],
  A: [],
  S: ["평생학습매니저", "사회복지사", "노인일자리 전담인력", "의사국가시험 표준화환자", "늘봄학교 안전지원단", "특수아동 돌봄 안전지도관", "초등학교 통학도우미", "통일교육 강사", "시니어행복강사", "장애인활동지원사", "취업지원팀장"],
  E: ["자율방범 어드바이저", "경륜장 질서유지", "건설민원 대응", "해수면위험구역 안전관리자"],
  C: ["임산물유통관리조사원", "경마보안·경마지원직", "물류·입출고 관리", "법무법인 사무장"],
};

// 검토표에서 '중복 제외'·'검토 필요'로 판정해 추천에 다시 들어오면 안 되는 대표 예시.
const rejected = ["운전학원 기능강사", "교통약자 이동지원차량·장애인콜택시 운전원", "학교보안관", "관리소장", "산림재난대응단", "신호수", "환경감시원", "학감", "금융보안원", "서해5도특별경비단", "국세체납관리단", "숙직전담원·숙직전담관", "탐정경찰학 강사", "환자이송원", "철도사옥경비"];

const expected = (type: RiasecType) => [...source[type], ...priority[type], ...reserve[type]].slice(0, JOBS_PER_TYPE[type]);
const latest = catalog.sources.filter((job) => !("tier" in job));
const display = (id: string) => catalog.display.find((job) => job.id === id)?.name;

describe("최신 PDF 추천직업", () => {
  it("유형별 전체 원문 이름과 순서를 보존한다", () => {
    for (const type of RIASEC_ORDER) {
      expect(latest.filter((job) => job.type === type).map((job) => job.rawName)).toEqual(source[type]);
      expect(catalog.representatives[type].slice(0, source[type].length).map((entry) => display(entry.displayId))).toEqual(source[type]);
    }
  });

  it("30개 1·2순위 조합에서 PDF 이외 직업을 추천하지 않고 원문 순서를 따른다", () => {
    for (const top1 of RIASEC_ORDER) for (const top2 of RIASEC_ORDER) {
      if (top1 === top2) continue;
      const recommendations = selectJobs(top1, top2);
      expect(recommendations.map((entry) => entry.type)).toEqual([top1, top2]);
      for (const entry of recommendations) {
        expect(entry.jobs).toEqual(expected(entry.type));
        expect(entry.jobs.slice(0, source[entry.type].length)).toEqual(source[entry.type]);
        expect(entry.count).toBe(entry.jobs.length);
        expect(entry.hasMore).toBe(entry.jobs.length < source[entry.type].length + priority[entry.type].length + reserve[entry.type].length);
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
    expect(selectJobs("R", "I", undefined, duplicate)[1].jobs).toEqual(expected("I").slice(1));
  });

  it("같은 유형은 상대 유형과 순위가 바뀌어도 동일한 목록이다", () => {
    for (const type of RIASEC_ORDER) for (const other of RIASEC_ORDER) {
      if (type === other) continue;
      expect(selectJobs(type, other)[0].jobs).toEqual(expected(type));
      expect(selectJobs(other, type)[1].jobs).toEqual(expected(type));
    }
  });
});

describe("개정판 추가 직업", () => {
  it("신규 우선은 최신 직업 뒤 대표 목록에, 신규 후순위는 예비 목록에 검토표 순서대로 있다", () => {
    for (const type of RIASEC_ORDER) {
      expect(catalog.representatives[type].slice(source[type].length).map((entry) => display(entry.displayId))).toEqual(priority[type]);
      expect(catalog.supplements[type].map(display)).toEqual(reserve[type]);
    }
    expect(catalog.sources).toHaveLength(72 + 16 + 30);
  });

  it("추가 직업은 출처 문서·쪽·직업군을 기록하고, 전체 카탈로그에 같은 이름이 없다", () => {
    for (const job of catalog.sources.filter((entry) => "tier" in entry) as JobCatalog["sources"]) {
      expect(job.document).toBe("직업선호도_해설지_퇴직경찰개정판.pdf");
      expect(job.page).toBeGreaterThan(0);
      expect(job.jobGroup).toBeTruthy();
      expect(["revised-body", "revised-appendix"]).toContain(job.origin);
    }
    const names = catalog.sources.map((job) => normalizeJobName(job.rawName));
    expect(new Set(names).size).toBe(names.length);
    for (const name of rejected) expect(names).not.toContain(normalizeJobName(name));
  });

  it("상한이 줄어도 최신 직업이 먼저이고, 후순위만 잘린다", () => {
    const [r] = selectJobs("R", "I", undefined, undefined, source.R.length + priority.R.length + 2);
    expect(r.jobs).toEqual([...source.R, ...priority.R, ...reserve.R.slice(0, 2)]);
    expect(r.hasMore).toBe(true);
  });

  it("인쇄 측정용 골든 파일(jobs-30.json)이 selectJobs 결과와 같다", () => {
    const path = new URL("./__fixtures__/jobs-30.json", import.meta.url);
    const actual: Record<string, ReturnType<typeof selectJobs>> = {};
    for (const top1 of RIASEC_ORDER) for (const top2 of RIASEC_ORDER) if (top1 !== top2) actual[top1 + top2] = selectJobs(top1, top2);
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(path, JSON.stringify(actual, null, 2) + "\n");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(actual);
  });
});
