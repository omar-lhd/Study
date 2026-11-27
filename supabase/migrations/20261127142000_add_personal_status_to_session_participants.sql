alter table public.study_session_participants
  add column if not exists personal_status text;

alter table public.study_session_participants
  drop constraint if exists study_session_participants_personal_status_check;

alter table public.study_session_participants
  add constraint study_session_participants_personal_status_check
  check (personal_status is null or personal_status in ('coffee','restroom','quick_talk'));

create index if not exists study_session_participants_session_personal_status_idx
  on public.study_session_participants(session_id,personal_status)
  where personal_status is not null;

notify pgrst,'reload schema';
