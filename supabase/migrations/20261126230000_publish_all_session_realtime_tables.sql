begin;
do $publication$
declare v_table text;
begin
 foreach v_table in array array[
  'study_session_chat','study_session_devices','study_session_events','study_session_files',
  'study_session_goals','study_session_intervals','study_session_invitations','study_session_notes',
  'study_session_participants','study_session_pause_requests','study_session_pause_votes',
  'study_session_seat_requests','study_session_speaker_seats','study_session_time_change_requests',
  'study_session_time_change_votes','study_session_whiteboard_elements','study_session_whiteboard_pages',
  'study_sessions'
 ] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
   execute format('alter publication supabase_realtime add table public.%I',v_table);
  end if;
 end loop;
end;
$publication$;
commit;
