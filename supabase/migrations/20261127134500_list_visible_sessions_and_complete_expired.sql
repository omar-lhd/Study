-- A single permission-checked session overview RPC. It also finalizes expired
-- sessions when someone opens/refreshes the community list, avoiding stale "active" cards.
create or replace function public.list_visible_shared_study_sessions()
returns table(
  id uuid,
  title text,
  subject text,
  subject_color text,
  session_type text,
  status text,
  access_type text,
  starts_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  planned_duration_seconds integer,
  created_at timestamptz,
  host_id uuid,
  created_by uuid,
  group_id uuid,
  participant_count integer
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_now timestamptz:=clock_timestamp();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  with expired as (
    update public.study_sessions s
    set status='completed',
        accumulated_study_seconds=s.planned_duration_seconds,
        running_since=null,
        ended_at=v_now,
        updated_at=v_now
    where s.status='active'
      and s.running_since is not null
      and s.accumulated_study_seconds + greatest(0,floor(extract(epoch from(v_now-s.running_since)))::integer)>=s.planned_duration_seconds
      and private.is_study_community_member(s.group_id,s.created_by)
      and (s.access_type='group' or s.created_by=v_user or private.is_session_participant(s.id))
    returning s.id,s.host_id
  )
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  select expired.id,expired.host_id,'session.auto_completed',
    jsonb_build_object('reason','duration_elapsed','completed_at',v_now)
  from expired;

  return query
  select s.id,s.title,s.subject,s.subject_color,s.session_type,s.status,s.access_type,
         s.starts_at,s.started_at,s.ended_at,s.planned_duration_seconds,s.created_at,
         s.host_id,s.created_by,s.group_id,
         (
           select count(distinct p.user_id)::integer
           from public.study_session_participants p
           where p.session_id=s.id and p.attendance_state='present'
             and exists(
               select 1 from public.study_session_devices d
               where d.session_id=s.id and d.participant_id=p.id
                 and d.connection_state='connected'
                 and d.last_seen_at>v_now-interval '45 seconds'
             )
         ) as participant_count
  from public.study_sessions s
  where private.is_study_community_member(s.group_id,s.created_by)
    and (s.access_type='group' or s.created_by=v_user or private.is_session_participant(s.id))
  order by s.starts_at asc nulls last,s.created_at desc;
end;
$function$;

revoke all on function public.list_visible_shared_study_sessions() from public,anon;
grant execute on function public.list_visible_shared_study_sessions() to authenticated;
notify pgrst,'reload schema';
