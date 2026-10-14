-- 프로토타입 기본 과정 지정.
-- 홈페이지(/)의 [직업흥미 진단 시작하기] 는 is_default = true 인 과정 한 개로 연결된다.
-- 과정 코드나 ID 는 코드에 적지 않고, 이 표시로만 정한다.

-- 운영 중인 과정인지. 기존 과정은 모두 활성(true)으로 시작한다.
alter table courses add column is_active boolean not null default true;

-- 프로토타입에서 홈페이지가 연결할 기본 과정인지. 기존 과정은 지정되지 않은 상태(false)로 시작한다.
alter table courses add column is_default boolean not null default false;

-- 기본 과정은 최대 한 개만 지정할 수 있다.
create unique index courses_single_default_idx on courses (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- 사용 예 (SQL Editor 에서 필요할 때 직접 실행한다. 이 파일을 실행해도 아래는 실행되지 않는다)
--
-- 1) 기본 과정으로 쓸 과정 만들기 (코드는 무작위 24자, 허용 문자 [A-Za-z0-9_-] 만 사용)
--    insert into courses (code, name, is_default)
--    values (translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '직업흥미 진단 프로토타입', true);
--
-- 2) 이미 있는 과정을 기본 과정으로 지정하기 (기존 기본 과정이 있으면 먼저 해제해야 한다)
--    update courses set is_default = false where is_default;
--    update courses set is_default = true where code = '여기에 과정 코드';
--
-- 3) 진행을 멈추기 (홈페이지는 "진행하지 않고 있어요" 안내를 보여준다)
--    update courses set is_active = false where is_default;
--
-- 4) 다시 열기
--    update courses set is_active = true where is_default;
-- ---------------------------------------------------------------------------
