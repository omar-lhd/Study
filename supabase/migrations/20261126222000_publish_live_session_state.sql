begin;
do $publication$
declare v_table text;
begin
  foreach v_table in array array['study_sessions','study_session_devices'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end;
$publication$;
notify pgrst,'reload schema';
commit;
