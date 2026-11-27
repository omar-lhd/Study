alter table public.study_sessions
  add column if not exists resume_at timestamptz;

update public.study_sessions
set resume_at=null
where status<>'paused';

create or replace function public.get_study_session_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.study_sessions%rowtype;
  v_seconds bigint;
  v_pid uuid;
  v_is_present boolean;
  v_is_allowed boolean:=false;
  v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.study_sessions where id=p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select p.id,p.attendance_state='present'
  into v_pid,v_is_present
  from public.study_session_participants p
  where p.session_id=p_session_id and p.user_id=v_user;

  if v_pid is not null then
    v_is_allowed:=true;
  elsif v_session.access_type='group' then
    v_is_allowed:=exists(select 1 from public.group_members gm where gm.group_id=v_session.group_id and gm.user_id=v_user);
  end if;

  if not v_is_allowed then raise exception 'SESSION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;

  v_seconds:=v_session.accumulated_study_seconds;
  if v_session.status='active' and v_session.running_since is not null then
    v_seconds:=v_seconds+greatest(0,floor(extract(epoch from(v_now-v_session.running_since)))::bigint);
  end if;

  return jsonb_build_object(
    'id',v_session.id,'title',v_session.title,'subject',v_session.subject,'subject_color',v_session.subject_color,
    'session_type',v_session.session_type,'status',v_session.status,'access_type',v_session.access_type,
    'starts_at',v_session.starts_at,'started_at',v_session.started_at,'ended_at',v_session.ended_at,
    'planned_duration_seconds',v_session.planned_duration_seconds,'accumulated_study_seconds',v_seconds,
    'running_since',v_session.running_since,'resume_at',v_session.resume_at,'server_now',v_now,'host_id',v_session.host_id,
    'participant_id',v_pid,'is_present',coalesce(v_is_present,false),'allow_audio',v_session.allow_audio,
    'speaker_seat_count',(select count(*) from public.study_session_speaker_seats where session_id=p_session_id),
    'participant_count',(select count(*) from public.study_session_participants p where p.session_id=p_session_id and p.attendance_state='present'
      and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>v_now-interval '45 seconds'))
  );
end;
$function$;

create or replace function public.request_study_session_resume(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.study_sessions%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_resume_at timestamptz;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.study_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not exists(
    select 1 from public.study_session_participants p
    where p.session_id=p_session_id and p.user_id=v_user and p.attendance_state='present'
  ) then raise exception 'PRESENT_PARTICIPANT_REQUIRED' using errcode='42501'; end if;
  if v_session.status<>'paused' then raise exception 'SESSION_NOT_PAUSED'; end if;

  v_resume_at:=coalesce(v_session.resume_at,v_now+interval '10 seconds');
  if v_session.resume_at is null then
    update public.study_sessions set resume_at=v_resume_at,updated_at=v_now where id=p_session_id;
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(p_session_id,v_user,'session.resume_countdown',jsonb_build_object('resume_at',v_resume_at,'seconds',10));
  end if;
  return v_resume_at;
end;
$function$;

create or replace function public.complete_study_session_resume(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.study_sessions%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.study_sessions where id=p_session_id for update;
  if not found then return false; end if;
  if not exists(
    select 1 from public.study_session_participants p
    where p.session_id=p_session_id and p.user_id=v_user and p.attendance_state='present'
  ) then raise exception 'PRESENT_PARTICIPANT_REQUIRED' using errcode='42501'; end if;
  if v_session.status<>'paused' or v_session.resume_at is null or v_session.resume_at>v_now then
    return false;
  end if;

  update public.study_sessions
  set status='active',running_since=v_now,resume_at=null,updated_at=v_now
  where id=p_session_id and status='paused' and resume_at<=v_now;
  if not found then return false; end if;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'session.resumed',jsonb_build_object('resumed_at',v_now));
  return true;
end;
$function$;

create or replace function public.set_study_session_state(p_session_id uuid,p_action text)
returns public.study_sessions
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_s public.study_sessions%rowtype;
  v_user uuid:=auth.uid();
  v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_s from public.study_sessions where id=p_session_id for update;
  if not found or not private.is_session_moderator(p_session_id) then
    raise exception 'MODERATOR_REQUIRED' using errcode='42501';
  end if;

  if p_action='start' and v_s.status='scheduled' then
    update public.study_sessions set status='active',started_at=v_now,running_since=v_now,resume_at=null,updated_at=v_now where id=p_session_id returning * into v_s;
  elsif p_action='pause' and v_s.status='active' then
    update public.study_sessions set status='paused',accumulated_study_seconds=accumulated_study_seconds+greatest(0,floor(extract(epoch from(v_now-running_since)))::integer),running_since=null,resume_at=null,updated_at=v_now where id=p_session_id returning * into v_s;
  elsif p_action='resume' then
    raise exception 'USE_SHARED_RESUME_COUNTDOWN';
  elsif p_action='complete' and v_s.status in('active','paused') then
    update public.study_sessions set status='completed',accumulated_study_seconds=least(planned_duration_seconds,accumulated_study_seconds+case when status='active' then greatest(0,floor(extract(epoch from(v_now-running_since)))::integer) else 0 end),running_since=null,resume_at=null,ended_at=v_now,updated_at=v_now where id=p_session_id returning * into v_s;
  elsif p_action='cancel' and v_s.status in('scheduled','active','paused') then
    update public.study_sessions set status='canceled',running_since=null,resume_at=null,ended_at=v_now,updated_at=v_now where id=p_session_id returning * into v_s;
  else
    raise exception 'INVALID_SESSION_TRANSITION';
  end if;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'session.'||p_action,jsonb_build_object('status',v_s.status));
  return v_s;
end;
$function$;

revoke all on function public.request_study_session_resume(uuid) from public,anon;
revoke all on function public.complete_study_session_resume(uuid) from public,anon;
grant execute on function public.request_study_session_resume(uuid) to authenticated;
grant execute on function public.complete_study_session_resume(uuid) to authenticated;
grant execute on function public.get_study_session_snapshot(uuid) to authenticated;
grant execute on function public.set_study_session_state(uuid,text) to authenticated;
notify pgrst,'reload schema';
