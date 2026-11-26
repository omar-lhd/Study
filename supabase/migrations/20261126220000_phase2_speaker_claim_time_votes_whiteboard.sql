begin;

-- Allow each present member to claim their own one of six speaker seats.
-- Locking the session row serializes concurrent seat claims.
create or replace function public.add_session_speaker_seat(p_session_id uuid, p_user_id uuid)
returns smallint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_pid uuid;
  v_seat smallint;
  v_moderator boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;

  v_moderator := private.is_session_moderator(p_session_id);
  if p_user_id <> v_user and not v_moderator then
    raise exception 'CANNOT_ASSIGN_OTHER_MEMBER_SEAT' using errcode='42501';
  end if;

  perform 1 from public.study_sessions
  where id=p_session_id and status='active' and allow_audio
  for update;
  if not found then raise exception 'SESSION_AUDIO_NOT_AVAILABLE'; end if;

  select id into v_pid
  from public.study_session_participants
  where session_id=p_session_id and user_id=p_user_id and attendance_state='present'
  for update;
  if v_pid is null then raise exception 'PARTICIPANT_NOT_PRESENT'; end if;

  select seat_number into v_seat
  from public.study_session_speaker_seats
  where session_id=p_session_id and participant_id=v_pid;
  if v_seat is not null then return v_seat; end if;

  select n::smallint into v_seat
  from generate_series(1,6) n
  where not exists(
    select 1 from public.study_session_speaker_seats s
    where s.session_id=p_session_id and s.seat_number=n
  )
  order by n limit 1;

  if v_seat is null then raise exception 'SPEAKER_SEAT_CAP_REACHED'; end if;

  insert into public.study_session_speaker_seats(session_id,seat_number,participant_id,granted_by)
  values(p_session_id,v_seat,v_pid,v_user);

  return v_seat;
end;
$function$;

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
  where ss.session_id=p_session_id
    and ss.participant_id=p.id
    and (p.user_id=v_user or private.is_session_moderator(p_session_id));
end;
$function$;

-- Durable system event for seat assignment/release, visible to all participants.
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
  else
    v_session:=old.session_id;
    v_participant:=old.participant_id;
    v_seat:=old.seat_number;
    v_actor:=auth.uid();
    v_event:='speaker.seat_released';
  end if;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(v_session,v_actor,v_event,jsonb_build_object('participant_id',v_participant,'seat_number',v_seat));
  return coalesce(new,old);
end;
$function$;

drop trigger if exists study_session_seat_event_log on public.study_session_speaker_seats;
create trigger study_session_seat_event_log
after insert or delete on public.study_session_speaker_seats
for each row execute function private.log_study_session_seat_event();

-- A pause request is a 60-second vote. The requester casts an initial yes vote.
create or replace function public.request_session_pause(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_session public.study_sessions%rowtype;
  v_id uuid;
  v_electorate uuid[];
  v_total integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_session from public.study_sessions where id=p_session_id for update;
  if not found or v_session.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select array_agg(p.user_id order by p.user_id) into v_electorate
  from public.study_session_participants p
  where p.session_id=p_session_id and p.attendance_state='present'
    and exists(
      select 1 from public.study_session_devices d
      where d.session_id=p_session_id and d.participant_id=p.id
        and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds'
    );

  if not(v_user=any(coalesce(v_electorate,'{}'::uuid[]))) then
    raise exception 'PRESENCE_REQUIRED' using errcode='42501';
  end if;

  v_total:=coalesce(array_length(v_electorate,1),0);
  insert into public.study_session_pause_requests(session_id,requested_by,electorate,policy,expires_at,yes_count)
  values(p_session_id,v_user,coalesce(v_electorate,'{}'::uuid[]),
    jsonb_build_object('electorate','snapshot_at_request','quorum','strict_majority','expiration_seconds',60),
    now()+interval '60 seconds',1)
  returning id into v_id;

  insert into public.study_session_pause_votes(request_id,voter_id,vote)
  values(v_id,v_user,'yes');

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'session.pause_requested',jsonb_build_object('request_id',v_id,'yes_count',1,'total',v_total,'expires_in_seconds',60));

  if v_total=1 then
    update public.study_session_pause_requests set status='approved',resolved_at=now() where id=v_id;
    update public.study_sessions
    set status='paused',
        accumulated_study_seconds=accumulated_study_seconds+greatest(0,floor(extract(epoch from(now()-running_since)))::integer),
        running_since=null,updated_at=now()
    where id=p_session_id and status='active';
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(p_session_id,v_user,'session.pause',jsonb_build_object('source','vote','request_id',v_id));
  end if;
  return v_id;
end;
$function$;

create or replace function public.vote_session_pause(p_request_id uuid,p_vote text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_r public.study_session_pause_requests%rowtype;
  v_total integer;
  v_yes integer;
  v_no integer;
  v_required integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_vote not in('yes','no') then raise exception 'INVALID_VOTE'; end if;

  select * into v_r from public.study_session_pause_requests where id=p_request_id for update;
  if not found or v_r.status<>'pending' then raise exception 'VOTE_CLOSED'; end if;
  if v_r.expires_at<=now() then
    update public.study_session_pause_requests set status='expired',resolved_at=now() where id=p_request_id;
    return 'expired';
  end if;
  if not(v_user=any(v_r.electorate)) then raise exception 'NOT_IN_ELECTORATE' using errcode='42501'; end if;

  insert into public.study_session_pause_votes(request_id,voter_id,vote)
  values(p_request_id,v_user,p_vote)
  on conflict(request_id,voter_id) do update set vote=excluded.vote,created_at=now();

  select count(*) filter(where vote='yes'),count(*) filter(where vote='no')
  into v_yes,v_no from public.study_session_pause_votes where request_id=p_request_id;
  v_total:=coalesce(array_length(v_r.electorate,1),0);
  v_required:=floor(v_total/2.0)::integer+1;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(v_r.session_id,v_user,'session.pause_vote',jsonb_build_object('request_id',p_request_id,'vote',p_vote,'yes_count',v_yes,'no_count',v_no,'total',v_total));

  if v_yes>=v_required then
    update public.study_session_pause_requests set status='approved',yes_count=v_yes,no_count=v_no,resolved_at=now() where id=p_request_id;
    update public.study_sessions
    set status='paused',
        accumulated_study_seconds=accumulated_study_seconds+greatest(0,floor(extract(epoch from(now()-running_since)))::integer),
        running_since=null,updated_at=now()
    where id=v_r.session_id and status='active';
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(v_r.session_id,v_user,'session.pause',jsonb_build_object('source','vote','request_id',p_request_id));
    return 'approved';
  elsif v_no>v_total-v_required then
    update public.study_session_pause_requests set status='rejected',yes_count=v_yes,no_count=v_no,resolved_at=now() where id=p_request_id;
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(v_r.session_id,v_user,'session.pause_rejected',jsonb_build_object('request_id',p_request_id,'yes_count',v_yes,'no_count',v_no,'total',v_total));
    return 'rejected';
  end if;

  update public.study_session_pause_requests set yes_count=v_yes,no_count=v_no where id=p_request_id;
  return 'pending';
end;
$function$;

-- Group-wide timer duration proposals, requiring approval from at least half
-- of the present electorate (the proposing host's yes vote is pre-recorded).
create table if not exists public.study_session_time_change_requests(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  delta_seconds integer not null check(delta_seconds between -28800 and 28800 and delta_seconds<>0),
  proposed_duration_seconds integer not null check(proposed_duration_seconds between 300 and 28800),
  electorate uuid[] not null,
  yes_count integer not null default 0,
  no_count integer not null default 0,
  status text not null default 'pending' check(status in('pending','approved','rejected','expired','canceled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists study_session_time_change_requests_session_idx
  on public.study_session_time_change_requests(session_id,status,created_at desc);

create table if not exists public.study_session_time_change_votes(
  request_id uuid not null references public.study_session_time_change_requests(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check(vote in('yes','no')),
  created_at timestamptz not null default now(),
  primary key(request_id,voter_id)
);

alter table public.study_session_time_change_requests enable row level security;
alter table public.study_session_time_change_votes enable row level security;
drop policy if exists study_session_time_change_requests_select on public.study_session_time_change_requests;
create policy study_session_time_change_requests_select on public.study_session_time_change_requests
for select to authenticated using(private.is_session_participant(session_id));
drop policy if exists study_session_time_change_votes_select on public.study_session_time_change_votes;
create policy study_session_time_change_votes_select on public.study_session_time_change_votes
for select to authenticated using(exists(
  select 1 from public.study_session_time_change_requests r
  where r.id=request_id and private.is_session_participant(r.session_id)
));
grant select on public.study_session_time_change_requests,public.study_session_time_change_votes to authenticated;

create or replace function public.propose_session_time_change(p_session_id uuid,p_delta_seconds integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_s public.study_sessions%rowtype;
  v_electorate uuid[];
  v_total integer;
  v_required integer;
  v_new_duration integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_delta_seconds is null or p_delta_seconds=0 or abs(p_delta_seconds)>28800 then raise exception 'INVALID_TIME_DELTA'; end if;
  select * into v_s from public.study_sessions where id=p_session_id for update;
  if not found or v_s.status not in('active','paused') then raise exception 'SESSION_NOT_ACTIVE'; end if;
  if not private.is_session_moderator(p_session_id) then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;

  v_new_duration:=v_s.planned_duration_seconds+p_delta_seconds;
  if v_new_duration not between 300 and 28800 then raise exception 'DURATION_OUT_OF_RANGE'; end if;

  select array_agg(p.user_id order by p.user_id) into v_electorate
  from public.study_session_participants p
  where p.session_id=p_session_id and p.attendance_state='present'
    and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds');

  if not(v_user=any(coalesce(v_electorate,'{}'::uuid[]))) then raise exception 'PRESENCE_REQUIRED' using errcode='42501'; end if;
  v_total:=coalesce(array_length(v_electorate,1),0);
  v_required:=(v_total+1)/2;

  insert into public.study_session_time_change_requests(session_id,requested_by,delta_seconds,proposed_duration_seconds,electorate,yes_count,expires_at)
  values(p_session_id,v_user,p_delta_seconds,v_new_duration,coalesce(v_electorate,'{}'::uuid[]),1,now()+interval '60 seconds')
  returning id into v_id;
  insert into public.study_session_time_change_votes(request_id,voter_id,vote) values(v_id,v_user,'yes');

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'session.time_change_requested',jsonb_build_object('request_id',v_id,'delta_seconds',p_delta_seconds,'proposed_duration_seconds',v_new_duration,'yes_count',1,'total',v_total,'required',v_required,'expires_in_seconds',60));

  if v_total=1 then
    update public.study_session_time_change_requests set status='approved',resolved_at=now() where id=v_id;
    update public.study_sessions set planned_duration_seconds=v_new_duration,updated_at=now() where id=p_session_id;
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(p_session_id,v_user,'session.time_changed',jsonb_build_object('request_id',v_id,'delta_seconds',p_delta_seconds,'planned_duration_seconds',v_new_duration));
  end if;
  return v_id;
end;
$function$;

create or replace function public.vote_session_time_change(p_request_id uuid,p_vote text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_r public.study_session_time_change_requests%rowtype;
  v_total integer;
  v_required integer;
  v_yes integer;
  v_no integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_vote not in('yes','no') then raise exception 'INVALID_VOTE'; end if;
  select * into v_r from public.study_session_time_change_requests where id=p_request_id for update;
  if not found or v_r.status<>'pending' then raise exception 'VOTE_CLOSED'; end if;
  if v_r.expires_at<=now() then update public.study_session_time_change_requests set status='expired',resolved_at=now() where id=p_request_id; return 'expired'; end if;
  if not(v_user=any(v_r.electorate)) then raise exception 'NOT_IN_ELECTORATE' using errcode='42501'; end if;

  insert into public.study_session_time_change_votes(request_id,voter_id,vote)
  values(p_request_id,v_user,p_vote)
  on conflict(request_id,voter_id) do update set vote=excluded.vote,created_at=now();

  select count(*) filter(where vote='yes'),count(*) filter(where vote='no') into v_yes,v_no
  from public.study_session_time_change_votes where request_id=p_request_id;
  v_total:=coalesce(array_length(v_r.electorate,1),0);
  v_required:=(v_total+1)/2;

  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(v_r.session_id,v_user,'session.time_change_vote',jsonb_build_object('request_id',p_request_id,'vote',p_vote,'yes_count',v_yes,'no_count',v_no,'total',v_total,'required',v_required));

  if v_yes>=v_required then
    update public.study_session_time_change_requests set status='approved',yes_count=v_yes,no_count=v_no,resolved_at=now() where id=p_request_id;
    update public.study_sessions set planned_duration_seconds=v_r.proposed_duration_seconds,updated_at=now() where id=v_r.session_id and status in('active','paused');
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(v_r.session_id,v_user,'session.time_changed',jsonb_build_object('request_id',p_request_id,'delta_seconds',v_r.delta_seconds,'planned_duration_seconds',v_r.proposed_duration_seconds));
    return 'approved';
  elsif v_no>v_total-v_required then
    update public.study_session_time_change_requests set status='rejected',yes_count=v_yes,no_count=v_no,resolved_at=now() where id=p_request_id;
    insert into public.study_session_events(session_id,actor_id,event_type,payload)
    values(v_r.session_id,v_user,'session.time_change_rejected',jsonb_build_object('request_id',p_request_id,'yes_count',v_yes,'no_count',v_no,'total',v_total));
    return 'rejected';
  end if;
  update public.study_session_time_change_requests set yes_count=v_yes,no_count=v_no where id=p_request_id;
  return 'pending';
end;
$function$;

-- Persistent, multi-user whiteboard pages and vector elements.
create table if not exists public.study_session_whiteboard_pages(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  page_index integer not null default 0 check(page_index between 0 and 49),
  settings jsonb not null default '{"width":1200,"height":800,"background":"#ffffff","grid":"none","gridColor":"#e5e7eb"}'::jsonb
    check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=10000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(session_id,page_index)
);
create table if not exists public.study_session_whiteboard_elements(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  page_index integer not null default 0 check(page_index between 0 and 49),
  created_by uuid not null references auth.users(id) on delete cascade,
  element_type text not null check(element_type in('stroke','text','shape','image')),
  data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists study_session_whiteboard_elements_page_idx
  on public.study_session_whiteboard_elements(session_id,page_index,created_at);

alter table public.study_session_whiteboard_pages enable row level security;
alter table public.study_session_whiteboard_elements enable row level security;
drop policy if exists study_session_whiteboard_pages_select on public.study_session_whiteboard_pages;
create policy study_session_whiteboard_pages_select on public.study_session_whiteboard_pages
for select to authenticated using(private.is_session_participant(session_id));
drop policy if exists study_session_whiteboard_pages_insert on public.study_session_whiteboard_pages;
create policy study_session_whiteboard_pages_insert on public.study_session_whiteboard_pages
for insert to authenticated with check(private.is_present_session_participant(session_id) and updated_by=auth.uid());
drop policy if exists study_session_whiteboard_pages_update on public.study_session_whiteboard_pages;
create policy study_session_whiteboard_pages_update on public.study_session_whiteboard_pages
for update to authenticated using(private.is_present_session_participant(session_id))
with check(private.is_present_session_participant(session_id) and updated_by=auth.uid());
drop policy if exists study_session_whiteboard_elements_select on public.study_session_whiteboard_elements;
create policy study_session_whiteboard_elements_select on public.study_session_whiteboard_elements
for select to authenticated using(private.is_session_participant(session_id));
drop policy if exists study_session_whiteboard_elements_insert on public.study_session_whiteboard_elements;
create policy study_session_whiteboard_elements_insert on public.study_session_whiteboard_elements
for insert to authenticated with check(private.is_present_session_participant(session_id) and created_by=auth.uid());
drop policy if exists study_session_whiteboard_elements_update on public.study_session_whiteboard_elements;
create policy study_session_whiteboard_elements_update on public.study_session_whiteboard_elements
for update to authenticated using(private.is_present_session_participant(session_id))
with check(private.is_present_session_participant(session_id));
drop policy if exists study_session_whiteboard_elements_delete on public.study_session_whiteboard_elements;
create policy study_session_whiteboard_elements_delete on public.study_session_whiteboard_elements
for delete to authenticated using(private.is_present_session_participant(session_id) and (created_by=auth.uid() or private.is_session_moderator(session_id)));

grant select,insert,update on public.study_session_whiteboard_pages to authenticated;
grant select,insert,update,delete on public.study_session_whiteboard_elements to authenticated;

grant execute on function public.add_session_speaker_seat(uuid,uuid) to authenticated;
grant execute on function public.release_speaker_seat(uuid) to authenticated;
grant execute on function public.request_session_pause(uuid) to authenticated;
grant execute on function public.vote_session_pause(uuid,text) to authenticated;
grant execute on function public.propose_session_time_change(uuid,integer) to authenticated;
grant execute on function public.vote_session_time_change(uuid,text) to authenticated;

do $publication$
declare
  v_table text;
begin
  foreach v_table in array array[
    'study_session_participants','study_session_speaker_seats','study_session_events',
    'study_session_pause_requests','study_session_pause_votes',
    'study_session_time_change_requests','study_session_time_change_votes',
    'study_session_whiteboard_pages','study_session_whiteboard_elements'
  ] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end;
$publication$;

notify pgrst,'reload schema';
commit;
