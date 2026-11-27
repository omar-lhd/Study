-- Correct device presence updates to match the deployed study_session_devices columns.
-- Group-scoped sessions must accept any current member of the selected group.
-- Session creator is not required to be the community owner.
create or replace function public.join_study_session(p_session_id uuid,p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_s public.study_sessions%rowtype;
  v_p public.study_session_participants%rowtype;
  v_device text:=trim(coalesce(p_device_id,''));
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if char_length(v_device) not between 12 and 128 then raise exception 'INVALID_DEVICE_ID'; end if;

  -- Serialize with leave/cleanup and use the same session-first lock order.
  select * into v_s from public.study_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if not exists(
    select 1 from public.group_members gm
    where gm.group_id=v_s.group_id and gm.user_id=v_user
  ) then
    raise exception 'NOT_COMMUNITY_MEMBER' using errcode='42501';
  end if;

  if v_s.status in('completed','canceled') then raise exception 'SESSION_CLOSED'; end if;

  select * into v_p
  from public.study_session_participants
  where session_id=p_session_id and user_id=v_user
  for update;

  if not found then
    if v_s.access_type<>'group' then
      raise exception 'INVITATION_REQUIRED' using errcode='42501';
    end if;
    insert into public.study_session_participants(session_id,user_id,attendance_state,first_joined_at)
    values(p_session_id,v_user,'present',now())
    returning * into v_p;
  else
    update public.study_session_participants
    set attendance_state='present',first_joined_at=coalesce(first_joined_at,now()),updated_at=now()
    where id=v_p.id returning * into v_p;
    update public.study_session_invitations
    set status='accepted',responded_at=now()
    where session_id=p_session_id and invitee_id=v_user and status='pending';
  end if;

  insert into public.study_session_devices(session_id,participant_id,device_id)
  values(p_session_id,v_p.id,v_device)
  on conflict(session_id,participant_id,device_id)
  do update set last_seen_at=now(),connection_state='connected';

  if not exists(
    select 1 from public.study_session_intervals
    where session_id=p_session_id and participant_id=v_p.id and left_at is null
  ) then
    insert into public.study_session_intervals(session_id,participant_id)
    values(p_session_id,v_p.id);
  end if;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'participant.joined',jsonb_build_object('participant_id',v_p.id,'device_id',v_device));

  return jsonb_build_object(
    'participant_id',v_p.id,'status',v_s.status,'started_at',v_s.started_at,
    'running_since',v_s.running_since,'accumulated_study_seconds',v_s.accumulated_study_seconds,
    'planned_duration_seconds',v_s.planned_duration_seconds
  );
end;
$function$;

notify pgrst,'reload schema';

-- Serialize presence transitions per session to prevent join/leave/cleanup deadlocks.
-- join_study_session already locks study_sessions before participant/device rows.
create or replace function public.leave_study_session(p_session_id uuid,p_device_id text)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_pid uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  -- Global lock order for presence RPCs: session -> participant -> device -> interval -> seat.
  perform 1 from public.study_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select id into v_pid
  from public.study_session_participants
  where session_id=p_session_id and user_id=v_user
  for update;
  if v_pid is null then raise exception 'NOT_PARTICIPANT' using errcode='42501'; end if;

  update public.study_session_devices
  set connection_state='disconnected',last_seen_at=now()
  where session_id=p_session_id and participant_id=v_pid and device_id=p_device_id;

  if not exists(
    select 1 from public.study_session_devices
    where session_id=p_session_id and participant_id=v_pid
      and connection_state='connected' and last_seen_at>now()-interval '45 seconds'
  ) then
    update public.study_session_participants
    set attendance_state='left',last_left_at=now(),updated_at=now()
    where id=v_pid;
    update public.study_session_intervals
    set left_at=now()
    where session_id=p_session_id and participant_id=v_pid and left_at is null;
    delete from public.study_session_speaker_seats
    where session_id=p_session_id and participant_id=v_pid;
  end if;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'participant.left',jsonb_build_object('participant_id',v_pid,'device_id',p_device_id));
end;
$function$;

create or replace function public.cleanup_stale_study_session_presence(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_changed integer:=0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  -- Match join/leave lock order; do not lock device rows before the session.
  perform 1 from public.study_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not private.is_session_participant(p_session_id) then
    raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501';
  end if;

  update public.study_session_devices
  set connection_state='disconnected'
  where session_id=p_session_id and connection_state='connected'
    and last_seen_at<=now()-interval '45 seconds';

  with changed as (
    update public.study_session_participants p
    set attendance_state='left',whiteboard_open=false,updated_at=now()
    where p.session_id=p_session_id and p.attendance_state='present'
      and not exists(
        select 1 from public.study_session_devices d
        where d.session_id=p_session_id and d.participant_id=p.id
          and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds'
      )
    returning p.id,p.user_id
  )
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  select p_session_id,v_user,'participant.left',
    jsonb_build_object('participant_id',id,'user_id',user_id,'reason','connection_timeout')
  from changed;

  get diagnostics v_changed=row_count;

  delete from public.study_session_speaker_seats ss
  using public.study_session_participants p
  where ss.session_id=p_session_id and ss.participant_id=p.id
    and p.attendance_state='left';

  return v_changed;
end;
$function$;

grant execute on function public.leave_study_session(uuid,text) to authenticated;
grant execute on function public.cleanup_stale_study_session_presence(uuid) to authenticated;
notify pgrst,'reload schema';
