begin;
create or replace function public.expire_study_session_votes(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_count integer:=0; v_rows integer;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.is_session_participant(p_session_id) then raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501'; end if;

 with expired as (
  update public.study_session_pause_requests set status='expired',resolved_at=now()
  where session_id=p_session_id and status='pending' and expires_at<=now()
  returning id
 )
 insert into public.study_session_events(session_id,actor_id,event_type,payload)
 select p_session_id,v_user,'session.pause_vote_expired',jsonb_build_object('request_id',id) from expired;
 get diagnostics v_rows=row_count;
 v_count:=v_count+v_rows;

 with expired as (
  update public.study_session_time_change_requests set status='expired',resolved_at=now()
  where session_id=p_session_id and status='pending' and expires_at<=now()
  returning id
 )
 insert into public.study_session_events(session_id,actor_id,event_type,payload)
 select p_session_id,v_user,'session.time_change_expired',jsonb_build_object('request_id',id) from expired;
 get diagnostics v_rows=row_count;
 v_count:=v_count+v_rows;
 return v_count;
end;
$function$;
grant execute on function public.expire_study_session_votes(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
