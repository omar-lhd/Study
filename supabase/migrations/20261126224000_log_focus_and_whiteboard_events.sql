begin;
create or replace function private.log_study_session_participant_modes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.focus_mode is distinct from old.focus_mode then
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(new.session_id,auth.uid(),'session.focus_changed',jsonb_build_object('participant_id',new.id,'focus_mode',new.focus_mode));
  end if;
  if new.whiteboard_open is distinct from old.whiteboard_open then
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(new.session_id,auth.uid(),case when new.whiteboard_open then 'participant.whiteboard_opened' else 'participant.whiteboard_closed' end,
      jsonb_build_object('participant_id',new.id,'whiteboard_open',new.whiteboard_open));
  end if;
  return new;
end;
$function$;

drop trigger if exists log_study_session_participant_modes on public.study_session_participants;
create trigger log_study_session_participant_modes
after update of focus_mode,whiteboard_open on public.study_session_participants
for each row execute function private.log_study_session_participant_modes();

notify pgrst,'reload schema';
commit;
