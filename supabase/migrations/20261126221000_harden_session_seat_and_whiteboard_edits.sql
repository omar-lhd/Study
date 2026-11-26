begin;

create or replace function private.log_study_session_seat_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session uuid;
  v_participant uuid;
  v_seat smallint;
  v_actor uuid;
  v_event text;
begin
  if tg_op='INSERT' then
    v_session:=new.session_id;
    v_participant:=new.participant_id;
    v_seat:=new.seat_number;
    v_actor:=coalesce(auth.uid(),new.granted_by);
    v_event:='speaker.seat_granted';
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(v_session,v_actor,v_event,jsonb_build_object('participant_id',v_participant,'seat_number',v_seat));
    return new;
  end if;

  v_session:=old.session_id;
  v_participant:=old.participant_id;
  v_seat:=old.seat_number;
  v_actor:=auth.uid();
  v_event:='speaker.seat_released';
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(v_session,v_actor,v_event,jsonb_build_object('participant_id',v_participant,'seat_number',v_seat));
  return old;
end;
$function$;

-- Release only the caller's own seat. Moderator seat transfer is handled by
-- respond_speaker_seat_request and the moderator-only assignment RPC.
create or replace function public.release_speaker_seat(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  delete from public.study_session_speaker_seats ss
  using public.study_session_participants p
  where ss.session_id=p_session_id and ss.participant_id=p.id and p.user_id=v_user;
end;
$function$;

drop policy if exists study_session_whiteboard_elements_update on public.study_session_whiteboard_elements;
create policy study_session_whiteboard_elements_update on public.study_session_whiteboard_elements
for update to authenticated
using(private.is_present_session_participant(session_id) and (created_by=auth.uid() or private.is_session_moderator(session_id)))
with check(private.is_present_session_participant(session_id) and (created_by=auth.uid() or private.is_session_moderator(session_id)));

grant execute on function public.release_speaker_seat(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
