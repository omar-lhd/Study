create or replace function public.set_my_session_personal_status(
  p_session_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_participant_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('coffee','restroom','quick_talk') then
    raise exception 'INVALID_PERSONAL_STATUS';
  end if;

  select id into v_participant_id
  from public.study_session_participants
  where session_id=p_session_id and user_id=v_user and attendance_state='present'
  for update;
  if v_participant_id is null then raise exception 'PRESENT_PARTICIPANT_REQUIRED' using errcode='42501'; end if;

  update public.study_session_participants
  set personal_status=p_status,updated_at=now()
  where id=v_participant_id;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(
    p_session_id,
    v_user,
    'participant.personal_status',
    jsonb_build_object('status',p_status)
  );
end;
$function$;

revoke all on function public.set_my_session_personal_status(uuid,text) from public,anon;
grant execute on function public.set_my_session_personal_status(uuid,text) to authenticated;

-- Anonymous clients must never be allowed to invoke session lifecycle SECURITY DEFINER RPCs.
revoke all on function public.cleanup_stale_study_session_presence(uuid) from public,anon;
revoke all on function public.expire_study_session_votes(uuid) from public,anon;
revoke all on function public.propose_session_time_change(uuid,integer) from public,anon;
revoke all on function public.vote_session_time_change(uuid,text) from public,anon;
revoke all on function public.complete_expired_study_session(uuid) from public,anon;
grant execute on function public.cleanup_stale_study_session_presence(uuid) to authenticated;
grant execute on function public.expire_study_session_votes(uuid) to authenticated;
grant execute on function public.propose_session_time_change(uuid,integer) to authenticated;
grant execute on function public.vote_session_time_change(uuid,text) to authenticated;
grant execute on function public.complete_expired_study_session(uuid) to authenticated;

notify pgrst,'reload schema';
