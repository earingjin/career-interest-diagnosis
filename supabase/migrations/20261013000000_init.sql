-- 진로흥미 진단 초기 스키마
-- 모든 접근은 서버의 service role 로만 한다. anon / authenticated 에는 권한과 정책을 주지 않는다.

-- courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-Za-z0-9_-]{16,}$'),
  name text not null,
  created_at timestamptz not null default now()
);

-- sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  nickname text not null
    check (nickname ~ '^[가-힣A-Za-z0-9]{2,10}$'),
  phone_key text not null,
  -- 휴대폰 뒷자리 4자리의 HMAC-SHA256 값. 평문 저장 금지.
  token_hash text not null unique,
  -- 쿠키 토큰의 SHA-256 해시. 원본 토큰 저장 금지.
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted')),
  current_step text not null default 'general-1',
  -- 재접속 시 이어갈 화면 위치
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (course_id, nickname, phone_key),
  check (status <> 'submitted' or submitted_at is not null)
);

-- responses
create table responses (
  session_id uuid not null references sessions(id) on delete cascade,
  item_id text not null
    check (item_id ~ '^(g(0[1-9]|[1-3][0-9]|4[0-2])|a(0[1-9]|[12][0-9]|30))$'),
  value boolean not null,
  -- 일반성향(g): true=예, false=아니요
  -- 형용사(a): 선택한 항목만 행으로 저장하며 value 는 항상 true. 선택 해제 시 행 삭제.
  updated_at timestamptz not null default now(),
  primary key (session_id, item_id),
  check (item_id like 'g%' or (item_id like 'a%' and value = true))
);

-- auth_attempts
create table auth_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  -- 과정 id 와 닉네임을 합친 값의 해시. 실패 횟수 집계용.
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index auth_attempts_attempt_key_created_at_idx
  on auth_attempts (attempt_key, created_at);

-- results
create table results (
  session_id uuid primary key references sessions(id) on delete cascade,
  scoring_version text not null,
  general_scores jsonb not null,    -- {"R":0~7, "I":..., "C":...}
  adjective_scores jsonb not null,  -- {"R":0~5, ...}
  totals jsonb not null,            -- {"R":0~12, ...}
  top1 text not null check (top1 in ('R','I','A','S','E','C')),
  top2 text not null check (top2 in ('R','I','A','S','E','C')),
  tie_broken boolean not null default false,
  job_recommendations jsonb not null,
  created_at timestamptz not null default now(),
  check (top1 <> top2)
);

-- 접근 보안
alter table courses enable row level security;
alter table sessions enable row level security;
alter table responses enable row level security;
alter table auth_attempts enable row level security;
alter table results enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- 앞으로 만들 테이블에도 anon / authenticated 권한이 자동 부여되지 않도록 한다.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- anon, authenticated 용 정책(policy)은 만들지 않는다.
