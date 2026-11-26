begin;

-- PostgREST needs a direct FK to profiles to embed participant profiles.
-- All existing session participants were checked and have matching profiles.
alter table public.study_session_participants
  add constraint study_session_participants_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

create index if not exists study_session_participants_user_id_idx
  on public.study_session_participants(user_id);

notify pgrst, 'reload schema';
commit;
