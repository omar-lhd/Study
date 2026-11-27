-- Keep session visibility, snapshots, and audio-token membership checks aligned.
-- A participant is allowed to enter a shared community session when they are a
-- community member; private/invitation sessions still require explicit invitation.
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
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;

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
    'running_since',v_session.running_since,'server_now',v_now,'host_id',v_session.host_id,
    'participant_id',v_pid,'is_present',coalesce(v_is_present,false),'allow_audio',v_session.allow_audio,
    'speaker_seat_count',(select count(*) from public.study_session_speaker_seats where session_id=p_session_id),
    'participant_count',(select count(*) from public.study_session_participants p where p.session_id=p_session_id and p.attendance_state='present'
      and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>v_now-interval '45 seconds'))
  );
end;
$function$;

-- Expire a running timer atomically, preserving completed sessions as historical data.
create or replace function public.complete_expired_study_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_s public.study_sessions%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_s from public.study_sessions where id=p_session_id for update;
  if not found then return false; end if;
  if not private.is_session_participant(p_session_id) then raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501'; end if;
  if v_s.status<>'active' or v_s.running_since is null then return false; end if;
  if v_s.accumulated_study_seconds+greatest(0,floor(extract(epoch from(v_now-v_s.running_since)))::integer)<v_s.planned_duration_seconds then return false; end if;
  update public.study_sessions
  set status='completed',
      accumulated_study_seconds=planned_duration_seconds,
      running_since=null,
      ended_at=v_now,
      updated_at=v_now
  where id=p_session_id and status='active';
  if not found then return false; end if;
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_s.host_id,'session.auto_completed',jsonb_build_object('reason','duration_elapsed','completed_at',v_now));
  return true;
end;
$function$;

revoke all on function public.complete_expired_study_session(uuid) from public,anon;
grant execute on function public.complete_expired_study_session(uuid) to authenticated;
notify pgrst,'reload schema';
