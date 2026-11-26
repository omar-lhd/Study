begin;
alter table public.study_session_participants
  add column if not exists whiteboard_open boolean not null default false;

create or replace function private.clear_session_whiteboard_presence()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.attendance_state<>'present' then
    new.whiteboard_open:=false;
  end if;
  return new;
end;
$function$;

drop trigger if exists clear_session_whiteboard_presence on public.study_session_participants;
create trigger clear_session_whiteboard_presence
before update of attendance_state on public.study_session_participants
for each row execute function private.clear_session_whiteboard_presence();

notify pgrst,'reload schema';
commit;
