import "server-only";
import { cache } from "react";
import { createServerClient } from "../supabase/server";
import { COURSE_CODE_PATTERN } from "../session/request";

export type DefaultCourseOutcome =
  /** 활성 상태로 지정된 기본 과정이 있다. */
  | { kind: "ok"; code: string; name: string }
  /** 기본 과정으로 지정된 과정이 없다. */
  | { kind: "none" }
  /** 기본 과정이 있지만 비활성 상태다. */
  | { kind: "inactive" }
  /** 조회에 실패했거나 데이터가 올바르지 않다 (지정이 둘 이상, 과정 코드 형식 오류, 새 컬럼 없음 등). */
  | { kind: "error" };

type DefaultRow = { code: string; name: string; is_active: boolean };

/**
 * 홈페이지가 연결할 프로토타입 기본 과정을 DB 에서 찾는다 (읽기 전용).
 * 과정 코드나 ID 를 코드에 적지 않고 courses.is_default 표시로만 정한다.
 * 잘못된 과정으로 연결하지 않도록, 확실한 경우(활성 과정 정확히 1개)가 아니면 ok 를 돌려주지 않는다.
 */
export async function findDefaultCourse(
  db: ReturnType<typeof createServerClient> = createServerClient(),
): Promise<DefaultCourseOutcome> {
  try {
    // 지정은 한 개뿐이어야 한다 (유니크 인덱스). 둘 이상이 보이면 어느 쪽인지 알 수 없으므로 연결하지 않는다.
    const { data, error } = await db
      .from("courses")
      .select("code, name, is_active")
      .eq("is_default", true)
      .limit(2);
    if (error) {
      console.error("[default course]", error.code ?? "DB_ERROR");
      return { kind: "error" };
    }

    const rows = (data ?? []) as DefaultRow[];
    if (rows.length === 0) return { kind: "none" };
    if (rows.length > 1) {
      console.error("[default course] 기본 과정이 둘 이상 지정되어 있습니다.");
      return { kind: "error" };
    }

    const [course] = rows;
    if (course.is_active !== true) return { kind: "inactive" };
    if (!COURSE_CODE_PATTERN.test(course.code)) {
      console.error("[default course] 기본 과정의 코드 형식이 올바르지 않습니다.");
      return { kind: "error" };
    }
    return { kind: "ok", code: course.code, name: course.name };
  } catch (error) {
    console.error("[default course]", error instanceof Error ? error.message : "조회 실패");
    return { kind: "error" };
  }
}

/** 한 요청 안에서 여러 번 불러도 DB 는 한 번만 조회한다 (시작 버튼이 화면에 두 곳 있다). */
export const getDefaultCourse = cache(() => findDefaultCourse());
