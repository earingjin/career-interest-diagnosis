-- 응답 저장과 제출을 DB 함수로 처리한다.
-- 두 함수가 같은 sessions 행에 잠금을 잡으므로, 응답 저장과 제출이 동시에 일어나도
-- 제출 시점에 계산한 결과와 저장된 응답이 어긋나지 않는다.
--   save_response : sessions 행 FOR SHARE  (저장끼리는 동시에 진행, 제출과는 서로 기다림)
--   submit_session: sessions 행 FOR UPDATE (진행 중인 저장이 끝난 뒤 실행, 이후 저장은 제출 뒤에 실행되어 거부됨)
-- 두 함수 모두 security definer 를 쓰지 않는다. 서버의 service_role 로만 호출한다.

-- 1) 응답 하나 저장
create or replace function save_response(p_session_id uuid, p_item_id text, p_value boolean)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  s text;
  v_updated_at timestamptz;
begin
  select status into s from sessions where id = p_session_id for share;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if s <> 'in_progress' then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  -- 형용사는 선택한 항목만 행으로 남긴다. 선택 해제는 행 삭제다.
  if p_item_id like 'a%' and p_value = false then
    delete from responses where session_id = p_session_id and item_id = p_item_id;
    return now();
  end if;

  insert into responses (session_id, item_id, value, updated_at)
  values (p_session_id, p_item_id, p_value, now())
  on conflict (session_id, item_id) do update
    set value = excluded.value, updated_at = excluded.updated_at
  returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

-- 2) 제출: 응답 지문이 서버가 계산에 쓴 응답과 같을 때만 결과를 저장하고 제출 상태로 바꾼다.
create or replace function submit_session(p_session_id uuid, p_fingerprint text, p_result jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s text;
  v_general int;
  v_adjectives int;
  v_fingerprint text;
begin
  select status into s from sessions where id = p_session_id for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if s = 'submitted' then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  select
    count(*) filter (where item_id like 'g%'),
    count(*) filter (where item_id like 'a%')
  into v_general, v_adjectives
  from responses
  where session_id = p_session_id;

  if v_general <> 42 then
    raise exception 'GENERAL_INCOMPLETE';
  end if;
  if v_adjectives < 5 then
    raise exception 'ADJECTIVES_INSUFFICIENT';
  end if;

  -- src/lib/session/fingerprint.ts 의 responseFingerprint 와 같은 규칙
  select md5(coalesce(string_agg(item_id || ':' || value::text, ',' order by item_id collate "C"), ''))
  into v_fingerprint
  from responses
  where session_id = p_session_id;

  if v_fingerprint is distinct from p_fingerprint then
    raise exception 'RESPONSES_CHANGED';
  end if;

  insert into results (
    session_id, scoring_version, general_scores, adjective_scores, totals,
    top1, top2, tie_broken, job_recommendations
  ) values (
    p_session_id,
    p_result->>'scoringVersion',
    p_result->'generalScores',
    p_result->'adjectiveScores',
    p_result->'totals',
    p_result->>'top1',
    p_result->>'top2',
    (p_result->>'tieBroken')::boolean,
    p_result->'jobRecommendations'
  );

  update sessions
  set status = 'submitted', submitted_at = now()
  where id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- 3) 권한: service_role 만 실행할 수 있다.
revoke execute on function save_response(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function submit_session(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function save_response(uuid, text, boolean) to service_role;
grant execute on function submit_session(uuid, text, jsonb) to service_role;
