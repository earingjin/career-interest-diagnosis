import "server-only";
import { createServerClient } from "../supabase/server";
import { sha256Hex } from "../security/hash";
import { readSessionToken } from "./cookie";
import type { ExistingSession } from "./entry";

export type Db = ReturnType<typeof createServerClient>;

export type Course = { id: string; code: string; name: string };

export type SessionStatus = ExistingSession["status"];

/** 쿠키 토큰으로 찾은 세션. 화면·API 응답에 쓸 수 있는 값만 담는다. */
export type CurrentSession = {
  id: string;
  status: SessionStatus;
  currentStep: string;
  courseCode: string;
  courseName: string;
};

export type IdentitySession = { id: string } & ExistingSession;

type DbErrorLike = { code?: string; message: string };

export function dbError(context: string, error: DbErrorLike): Error {
  return new Error(`DB 오류 (${context}): ${error.code ?? "-"} ${error.message}`);
}

export async function findCourseByCode(db: Db, code: string): Promise<Course | null> {
  const { data, error } = await db.from("courses").select("id, code, name").eq("code", code).maybeSingle();
  if (error) throw dbError("courses 조회", error);
  return data ? { id: data.id, code: data.code, name: data.name } : null;
}

/** 같은 과정, 같은 닉네임, 같은 phone_key 로 세션을 찾는다. */
export async function findSessionByIdentity(
  db: Db,
  courseId: string,
  nickname: string,
  phoneKey: string,
): Promise<IdentitySession | null> {
  const { data, error } = await db
    .from("sessions")
    .select("id, status, token_hash")
    .eq("course_id", courseId)
    .eq("nickname", nickname)
    .eq("phone_key", phoneKey)
    .maybeSingle();
  if (error) throw dbError("sessions 조회", error);
  return data ? { id: data.id, status: data.status, tokenHash: data.token_hash } : null;
}

/** 쿠키의 원본 토큰을 해시해 token_hash 가 일치하는 세션을 찾는다. */
export async function findSessionByToken(db: Db, token: string): Promise<CurrentSession | null> {
  const { data, error } = await db
    .from("sessions")
    .select("id, status, current_step, courses(code, name)")
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  if (error) throw dbError("sessions 토큰 조회", error);
  if (!data) return null;

  const course = Array.isArray(data.courses) ? data.courses[0] : data.courses;
  if (!course) return null;
  return {
    id: data.id,
    status: data.status,
    currentStep: data.current_step,
    courseCode: course.code,
    courseName: course.name,
  };
}

/** 요청 쿠키의 토큰으로 현재 세션을 찾는다. 쿠키가 없거나 일치하는 세션이 없으면 null. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return findSessionByToken(createServerClient(), token);
}

/** 현재 쿠키 세션이 주어진 과정 코드의 세션일 때만 돌려준다. */
export async function getCurrentSessionForCourse(courseCode: string): Promise<CurrentSession | null> {
  const session = await getCurrentSession();
  return session && session.courseCode === courseCode ? session : null;
}
