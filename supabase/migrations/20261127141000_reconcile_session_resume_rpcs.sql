alter table public.study_sessions
  add column if not exists resume_at timestamptz;

create or replace function public.get_study_session_snapshot(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
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
  select p.id,p.attendance_state='present' into v_pid,v_is_present
  from public.study_session_participants p where p.session_id=p_session_id and p.user_id=v_user;
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
returns timestamptz language plpgsql security definer set search_path=''
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
  if not exists(select 1 from public.study_session_participants p where p.session_id=p_session_id and p.user_id=v_user and p.attendance_state='present') then
    raise exception 'PRESENT_PARTICIPANT_REQUIRED' using errcode='42501';
  end if;
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
returns boolean language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.study_sessions%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.study_sessions where id=p_session_id for update;
  if not found then return false; end if;
  if not exists(select 1 from public.study_session_participants p where p.session_id=p_session_id and p.user_id=v_user and p.attendance_state='present') then
    raise exception 'PRESENT_PARTICIPANT_REQUIRED' using errcode='42501';
  end if;
  if v_session.status<>'paused' or v_session.resume_at is null or v_session.resume_at>v_now then return false; end if;
  update public.study_sessions set status='active',running_since=v_now,resume_at=null,updated_at=v_now
  where id=p_session_id and status='paused' and resume_at<=v_now;
  if not found then return false; end if;
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'session.resumed',jsonb_build_object('resumed_at',v_now));
  return true;
end;
$function$;

create or replace function public.list_visible_shared_study_sessions()
returns table(
  id uuid,title text,subject text,subject_color text,session_type text,status text,access_type text,
  starts_at timestamptz,started_at timestamptz,ended_at timestamptz,planned_duration_seconds integer,
  created_at timestamptz,host_id uuid,created_by uuid,group_id uuid,participant_count integer
)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  with expired as (
    update public.study_sessions s
    set status='completed',accumulated_study_seconds=s.planned_duration_seconds,
        running_since=null,resume_at=null,ended_at=v_now,updated_at=v_now
    where s.status='active' and s.running_since is not null
      and s.accumulated_study_seconds+greatest(0,floor(extract(epoch from(v_now-s.running_since)))::integer)>=s.planned_duration_seconds
      and (
        s.created_by=v_user
        or (s.access_type='group' and exists(select 1 from public.group_members gm where gm.group_id=s.group_id and gm.user_id=v_user))
        or (s.access_type<>'group' and private.is_session_participant(s.id))
      )
    returning s.id,s.host_id
  )
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  select expired.id,expired.host_id,'session.auto_completed',jsonb_build_object('reason','duration_elapsed','completed_at',v_now)
  from expired;

  return query
  select s.id,s.title,s.subject,s.subject_color,s.session_type,s.status,s.access_type,
    s.starts_at,s.started_at,s.ended_at,s.planned_duration_seconds,s.created_at,s.host_id,s.created_by,s.group_id,
    (select count(distinct p.user_id)::integer from public.study_session_participants p
      where p.session_id=s.id and p.attendance_state='present'
      and exists(select 1 from public.study_session_devices d
        where d.session_id=s.id and d.participant_id=p.id and d.connection_state='connected'
          and d.last_seen_at>v_now-interval '45 seconds')) as participant_count
  from public.study_sessions s
  where s.created_by=v_user
    or (s.access_type='group' and exists(select 1 from public.group_members gm where gm.group_id=s.group_id and gm.user_id=v_user))
    or (s.access_type<>'group' and private.is_session_participant(s.id))
  order by s.starts_at asc nulls last,s.created_at desc;
end;
$function$;

revoke all on function public.request_study_session_resume(uuid) from public,anon;
revoke all on function public.complete_study_session_resume(uuid) from public,anon;
revoke all on function public.list_visible_shared_study_sessions() from public,anon;
grant execute on function public.get_study_session_snapshot(uuid) to authenticated;
grant execute on function public.request_study_session_resume(uuid) to authenticated;
grant execute on function public.complete_study_session_resume(uuid) to authenticated;
grant execute on function public.list_visible_shared_study_sessions() to authenticated;
notify pgrst,'reload schema';
