-- 개인정보 수집 동의 시각. 기존 행에는 마이그레이션 실행 시각이 들어간다.
alter table sessions add column consent_at timestamptz not null default now();
