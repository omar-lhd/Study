begin;
create or replace function public.cleanup_stale_study_session_presence(p_session_id uuid)
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_changed integer:=0;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.is_session_participant(p_session_id) then raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501'; end if;
 update public.study_session_devices
 set connection_state='disconnected'
 where session_id=p_session_id and connection_state='connected' and last_seen_at<=now()-interval '45 seconds';
 with changed as (
  update public.study_session_participants p set attendance_state='left',whiteboard_open=false,updated_at=now()
  where p.session_id=p_session_id and p.attendance_state='present'
   and not exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds')
  returning p.id,p.user_id
 )
 insert into public.study_session_events(session_id,actor_id,event_type,payload)
 select p_session_id,v_user,'participant.left',jsonb_build_object('participant_id',id,'user_id',user_id,'reason','connection_timeout') from changed;
 get diagnostics v_changed=row_count;
 delete from public.study_session_speaker_seats ss using public.study_session_participants p
 where ss.session_id=p_session_id and ss.participant_id=p.id and p.attendance_state='left';
 return v_changed;
end;
$function$;
notify pgrst,'reload schema';
commit;
