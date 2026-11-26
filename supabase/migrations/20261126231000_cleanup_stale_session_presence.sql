begin;

create or replace function public.cleanup_stale_study_session_presence(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_user uuid:=auth.uid(); v_changed integer:=0;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.is_session_participant(p_session_id) then raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501'; end if;

 update public.study_session_devices
 set connection_state='disconnected',updated_at=now()
 where session_id=p_session_id and connection_state='connected' and last_seen_at<=now()-interval '45 seconds';

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
 select p_session_id,v_user,'participant.left',jsonb_build_object('participant_id',id,'user_id',user_id,'reason','connection_timeout')
 from changed;

 get diagnostics v_changed=row_count;

 delete from public.study_session_speaker_seats ss
 using public.study_session_participants p
 where ss.session_id=p_session_id and ss.participant_id=p.id and p.attendance_state='left';

 return v_changed;
end;
$function$;

create or replace function public.get_study_session_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_session public.study_sessions%rowtype; v_seconds bigint; v_pid uuid; v_is_present boolean;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into v_session from public.study_sessions where id=p_session_id;
 if not found or not private.is_session_participant(p_session_id) then raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501'; end if;
 v_seconds:=v_session.accumulated_study_seconds;
 if v_session.status='active' and v_session.running_since is not null then
  v_seconds:=v_seconds+greatest(0,floor(extract(epoch from(now()-v_session.running_since)))::bigint);
 end if;
 select id,attendance_state='present' into v_pid,v_is_present
 from public.study_session_participants where session_id=p_session_id and user_id=v_user;
 return jsonb_build_object(
  'id',v_session.id,'title',v_session.title,'subject',v_session.subject,'subject_color',v_session.subject_color,
  'session_type',v_session.session_type,'status',v_session.status,'access_type',v_session.access_type,
  'starts_at',v_session.starts_at,'started_at',v_session.started_at,'ended_at',v_session.ended_at,
  'planned_duration_seconds',v_session.planned_duration_seconds,'accumulated_study_seconds',v_seconds,
  'running_since',v_session.running_since,'server_now',now(),'host_id',v_session.host_id,
  'participant_id',v_pid,'is_present',coalesce(v_is_present,false),'allow_audio',v_session.allow_audio,
  'speaker_seat_count',(select count(*) from public.study_session_speaker_seats where session_id=p_session_id),
  'participant_count',(select count(*) from public.study_session_participants p where p.session_id=p_session_id and p.attendance_state='present'
    and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds'))
 );
end;
$function$;

grant execute on function public.cleanup_stale_study_session_presence(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
