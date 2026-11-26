-- Phase 2: authoritative Study Sessions, attendance, collaboration, governance and audio-seat control.
-- Additive only. Personal/Solo sessions remain local and never call Agora.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.study_sessions (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete restrict,
 host_id uuid not null references auth.users(id) on delete restrict,
 title text not null check(char_length(trim(title)) between 2 and 100),
 subject text check(subject is null or char_length(subject)<=60),
 subject_color text check(subject_color is null or subject_color~'^#[0-9A-Fa-f]{6}$'),
 description text not null default '' check(char_length(description)<=1000),
 session_type text not null check(session_type in('private','group','open_room')),
 status text not null default 'scheduled' check(status in('scheduled','active','paused','completed','canceled')),
 access_type text not null default 'invited' check(access_type in('creator_only','invited','group')),
 starts_at timestamptz,
 planned_duration_seconds integer not null check(planned_duration_seconds between 300 and 28800),
 started_at timestamptz, ended_at timestamptz,
 accumulated_study_seconds integer not null default 0 check(accumulated_study_seconds>=0),
 running_since timestamptz,
 total_paused_seconds integer not null default 0 check(total_paused_seconds>=0),
 focus_mode_default boolean not null default false,
 collaboration_enabled boolean not null default true,
 allow_audio boolean not null default true,
 max_speaker_seats smallint not null default 6 check(max_speaker_seats=6),
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint study_sessions_timer_state check((status='active' and running_since is not null) or(status<>'active' and running_since is null)),
 constraint study_sessions_started_ended check(ended_at is null or started_at is not null)
);
create index if not exists study_sessions_group_status_start_idx on public.study_sessions(group_id,status,starts_at);
create index if not exists study_sessions_host_created_idx on public.study_sessions(host_id,created_at desc);

create table if not exists public.study_session_participants (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.study_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 participant_role text not null default 'member' check(participant_role in('host','moderator','member')),
 attendance_state text not null default 'invited' check(attendance_state in('invited','present','left','suspended')),
 invited_by uuid references auth.users(id) on delete set null,
 invited_at timestamptz, first_joined_at timestamptz,last_left_at timestamptz,
 focus_mode boolean not null default false,
 personal_status text check(personal_status is null or personal_status in('coffee','restroom','quick_talk')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(session_id,user_id),unique(id,session_id)
);
create index if not exists study_session_participants_user_state_idx on public.study_session_participants(user_id,attendance_state,updated_at desc);

create table if not exists public.study_session_devices (
 session_id uuid not null,participant_id uuid not null,
 device_id text not null check(char_length(device_id) between 12 and 128),
 connected_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),
 connection_state text not null default 'connected' check(connection_state in('connected','reconnecting','disconnected')),
 primary key(session_id,participant_id,device_id),
 foreign key(participant_id,session_id) references public.study_session_participants(id,session_id) on delete cascade
);
create index if not exists study_session_devices_presence_idx on public.study_session_devices(session_id,last_seen_at desc);

create table if not exists public.study_session_intervals (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 participant_id uuid not null,joined_at timestamptz not null default now(),left_at timestamptz,
 foreign key(participant_id,session_id) references public.study_session_participants(id,session_id) on delete cascade,
 check(left_at is null or left_at>=joined_at)
);
create index if not exists study_session_intervals_participant_idx on public.study_session_intervals(session_id,participant_id,joined_at);

create table if not exists public.study_session_goals (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 text text not null check(char_length(trim(text)) between 1 and 240),completed boolean not null default false,
 completed_by uuid references auth.users(id) on delete set null,completed_at timestamptz,
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists study_session_goals_session_idx on public.study_session_goals(session_id,created_at);

create table if not exists public.study_session_notes (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete restrict,
 body text not null check(char_length(body)<=10000),
 note_kind text not null default 'note' check(note_kind in('note','question','answer','resource')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists study_session_notes_session_idx on public.study_session_notes(session_id,created_at);

create table if not exists public.study_session_chat (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete restrict,client_event_id uuid not null,
 content text not null check(char_length(trim(content)) between 1 and 5000),
 reply_to_id uuid references public.study_session_chat(id) on delete set null,created_at timestamptz not null default now(),
 unique(session_id,sender_id,client_event_id)
);
create index if not exists study_session_chat_session_created_idx on public.study_session_chat(session_id,created_at desc);

create table if not exists public.study_session_files (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 uploader_id uuid not null references auth.users(id) on delete restrict,storage_path text not null unique,
 file_name text not null check(char_length(file_name) between 1 and 255),
 mime_type text not null check(char_length(mime_type)<=150),
 file_size bigint not null check(file_size between 1 and 52428800),created_at timestamptz not null default now()
);
create index if not exists study_session_files_session_created_idx on public.study_session_files(session_id,created_at desc);

create table if not exists public.study_session_events (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,client_event_id uuid,
 event_type text not null check(char_length(event_type) between 1 and 80),
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),occurred_at timestamptz not null default now(),
 unique(session_id,actor_id,client_event_id)
);
create index if not exists study_session_events_session_time_idx on public.study_session_events(session_id,occurred_at);

create table if not exists public.study_session_invitations (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 inviter_id uuid not null references auth.users(id) on delete restrict,invitee_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in('pending','accepted','declined','expired','canceled')),
 responded_at timestamptz,created_at timestamptz not null default now(),unique(session_id,invitee_id)
);
create index if not exists study_session_invitations_user_status_idx on public.study_session_invitations(invitee_id,status,created_at desc);

create table if not exists public.study_session_pause_requests (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 requested_by uuid not null references auth.users(id) on delete restrict,
 status text not null default 'pending' check(status in('pending','approved','rejected','expired','canceled')),
 electorate uuid[] not null,yes_count integer not null default 0,no_count integer not null default 0,
 policy jsonb not null default '{}'::jsonb check(jsonb_typeof(policy)='object'),
 expires_at timestamptz not null,resolved_at timestamptz,created_at timestamptz not null default now()
);
create unique index if not exists study_session_pause_one_pending_idx on public.study_session_pause_requests(session_id) where status='pending';
create index if not exists study_session_pause_requests_session_idx on public.study_session_pause_requests(session_id,created_at desc);
create table if not exists public.study_session_pause_votes (
 request_id uuid not null references public.study_session_pause_requests(id) on delete cascade,
 voter_id uuid not null references auth.users(id) on delete restrict,
 vote text not null check(vote in('yes','no')),created_at timestamptz not null default now(),primary key(request_id,voter_id)
);

create table if not exists public.study_session_speaker_seats (
 session_id uuid not null references public.study_sessions(id) on delete cascade,
 seat_number smallint not null check(seat_number between 1 and 6),
 participant_id uuid not null,granted_by uuid not null references auth.users(id) on delete restrict,
 granted_at timestamptz not null default now(),primary key(session_id,seat_number),unique(session_id,participant_id),
 foreign key(participant_id,session_id) references public.study_session_participants(id,session_id) on delete cascade
);
create index if not exists study_session_speaker_seats_participant_idx on public.study_session_speaker_seats(session_id,participant_id);

create table if not exists public.study_session_seat_requests (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.study_sessions(id) on delete cascade,
 requester_id uuid not null references auth.users(id) on delete cascade,target_participant_id uuid not null,
 status text not null default 'pending' check(status in('pending','accepted','rejected','expired')),
 responded_by uuid references auth.users(id) on delete set null,responded_at timestamptz,
 policy jsonb not null default '{}'::jsonb check(jsonb_typeof(policy)='object'),
 expires_at timestamptz not null,created_at timestamptz not null default now(),
 foreign key(target_participant_id,session_id) references public.study_session_participants(id,session_id) on delete cascade
);
create unique index if not exists study_session_seat_one_pending_request_idx on public.study_session_seat_requests(session_id,requester_id) where status='pending';
create index if not exists study_session_seat_target_pending_idx on public.study_session_seat_requests(session_id,target_participant_id,status,created_at);

do $$ declare t text; begin
 foreach t in array array['study_sessions','study_session_participants','study_session_devices','study_session_intervals','study_session_goals','study_session_notes','study_session_chat','study_session_files','study_session_events','study_session_invitations','study_session_pause_requests','study_session_pause_votes','study_session_speaker_seats','study_session_seat_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;

grant select on public.study_sessions,public.study_session_participants,public.study_session_devices,public.study_session_intervals,
 public.study_session_events,public.study_session_invitations,public.study_session_pause_requests,public.study_session_pause_votes,
 public.study_session_speaker_seats,public.study_session_seat_requests to authenticated;
grant select,insert,update,delete on public.study_session_goals,public.study_session_notes to authenticated;
grant select,insert,delete on public.study_session_chat,public.study_session_files to authenticated;

create or replace function private.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=(select auth.uid()));
$$;
create or replace function private.is_session_participant(p_session_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_session_participants p where p.session_id=p_session_id and p.user_id=(select auth.uid()));
$$;
create or replace function private.is_present_session_participant(p_session_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_session_participants p where p.session_id=p_session_id and p.user_id=(select auth.uid()) and p.attendance_state='present');
$$;
create or replace function private.is_session_moderator(p_session_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_session_participants p where p.session_id=p_session_id and p.user_id=(select auth.uid()) and p.participant_role in('host','moderator'));
$$;
revoke all on all functions in schema private from public,anon;
grant execute on function private.is_group_member(uuid),private.is_session_participant(uuid),private.is_present_session_participant(uuid),private.is_session_moderator(uuid) to authenticated;

create policy study_sessions_select on public.study_sessions for select to authenticated using(private.is_group_member(group_id) and(access_type='group' or created_by=(select auth.uid()) or private.is_session_participant(id)));
create policy study_session_participants_select on public.study_session_participants for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_devices_select on public.study_session_devices for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_intervals_select on public.study_session_intervals for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_goals_select on public.study_session_goals for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_goals_insert on public.study_session_goals for insert to authenticated with check(created_by=(select auth.uid()) and private.is_present_session_participant(session_id));
create policy study_session_goals_update on public.study_session_goals for update to authenticated using(private.is_present_session_participant(session_id)) with check(private.is_present_session_participant(session_id));
create policy study_session_goals_delete on public.study_session_goals for delete to authenticated using(created_by=(select auth.uid()) or private.is_session_moderator(session_id));
create policy study_session_notes_select on public.study_session_notes for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_notes_insert on public.study_session_notes for insert to authenticated with check(author_id=(select auth.uid()) and private.is_present_session_participant(session_id));
create policy study_session_notes_update on public.study_session_notes for update to authenticated using(private.is_present_session_participant(session_id)) with check(private.is_present_session_participant(session_id));
create policy study_session_notes_delete on public.study_session_notes for delete to authenticated using(author_id=(select auth.uid()) or private.is_session_moderator(session_id));
create policy study_session_chat_select on public.study_session_chat for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_chat_insert on public.study_session_chat for insert to authenticated with check(sender_id=(select auth.uid()) and private.is_present_session_participant(session_id));
create policy study_session_chat_delete on public.study_session_chat for delete to authenticated using(sender_id=(select auth.uid()) or private.is_session_moderator(session_id));
create policy study_session_files_select on public.study_session_files for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_files_insert on public.study_session_files for insert to authenticated with check(uploader_id=(select auth.uid()) and private.is_present_session_participant(session_id));
create policy study_session_files_delete on public.study_session_files for delete to authenticated using(uploader_id=(select auth.uid()) or private.is_session_moderator(session_id));
create policy study_session_events_select on public.study_session_events for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_invitations_select on public.study_session_invitations for select to authenticated using(inviter_id=(select auth.uid()) or invitee_id=(select auth.uid()) or private.is_session_moderator(session_id));
create policy study_session_pause_requests_select on public.study_session_pause_requests for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_pause_votes_select on public.study_session_pause_votes for select to authenticated using(exists(select 1 from public.study_session_pause_requests r where r.id=request_id and private.is_session_participant(r.session_id)));
create policy study_session_speaker_seats_select on public.study_session_speaker_seats for select to authenticated using(private.is_session_participant(session_id));
create policy study_session_seat_requests_select on public.study_session_seat_requests for select to authenticated using(private.is_session_participant(session_id));

create or replace function public.create_study_session(
 p_title text,p_subject text,p_subject_color text,p_description text,p_session_type text,p_status text,
 p_access_type text,p_starts_at timestamptz,p_duration_seconds integer,p_invited_users uuid[],p_goals text[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_group uuid; v_session uuid; v_invitee uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_session_type not in('private','group','open_room') then raise exception 'INVALID_SESSION_TYPE'; end if;
 if p_status not in('scheduled','active') then raise exception 'INVALID_INITIAL_STATUS'; end if;
 if p_access_type not in('creator_only','invited','group') then raise exception 'INVALID_ACCESS_TYPE'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 2 and 100 then raise exception 'INVALID_TITLE'; end if;
 if p_duration_seconds not between 300 and 28800 then raise exception 'INVALID_DURATION'; end if;
 if p_subject_color is not null and p_subject_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_SUBJECT_COLOR'; end if;
 if coalesce(array_length(p_invited_users,1),0)>100 or coalesce(array_length(p_goals,1),0)>20 then raise exception 'TOO_MANY_ITEMS'; end if;
 select gm.group_id into v_group from public.group_members gm where gm.user_id=v_user order by gm.created_at limit 1;
 if v_group is null then raise exception 'APPROVED_COMMUNITY_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if p_session_type='private' and p_access_type='group' then raise exception 'PRIVATE_SESSION_ACCESS_MISMATCH'; end if;
 if p_session_type='open_room' and p_access_type<>'group' then raise exception 'OPEN_ROOM_MUST_BE_GROUP_VISIBLE'; end if;
 insert into public.study_sessions(group_id,created_by,host_id,title,subject,subject_color,description,session_type,status,access_type,starts_at,planned_duration_seconds,started_at,running_since)
 values(v_group,v_user,v_user,trim(p_title),nullif(trim(coalesce(p_subject,'')),''),p_subject_color,coalesce(p_description,''),p_session_type,p_status,p_access_type,p_starts_at,p_duration_seconds,case when p_status='active' then now() end,case when p_status='active' then now() end) returning id into v_session;
 insert into public.study_session_participants(session_id,user_id,participant_role,attendance_state,invited_at,first_joined_at)
 values(v_session,v_user,'host','present',now(),case when p_status='active' then now() end);
 if p_status='active' then insert into public.study_session_intervals(session_id,participant_id) select v_session,id from public.study_session_participants where session_id=v_session and user_id=v_user; end if;
 foreach v_invitee in array coalesce(p_invited_users,'{}'::uuid[]) loop
  if v_invitee<>v_user then
   if not exists(select 1 from public.group_members gm where gm.group_id=v_group and gm.user_id=v_invitee) then raise exception 'INVITEE_NOT_IN_COMMUNITY'; end if;
   insert into public.study_session_participants(session_id,user_id,participant_role,attendance_state,invited_by,invited_at) values(v_session,v_invitee,'member','invited',v_user,now()) on conflict(session_id,user_id) do nothing;
   insert into public.study_session_invitations(session_id,inviter_id,invitee_id) values(v_session,v_user,v_invitee) on conflict(session_id,invitee_id) do nothing;
  end if;
 end loop;
 if p_goals is not null then insert into public.study_session_goals(session_id,text,created_by) select v_session,trim(g),v_user from unnest(p_goals) as g where char_length(trim(g))>0; end if;
 insert into public.study_session_events(session_id,actor_id,event_type,payload) values(v_session,v_user,'session.created',jsonb_build_object('session_type',p_session_type,'initial_status',p_status));
 return v_session;
end; $$;

create or replace function public.join_study_session(p_session_id uuid,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_s public.study_sessions%rowtype; v_p public.study_session_participants%rowtype; v_device text:=trim(coalesce(p_device_id,''));
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if char_length(v_device) not between 12 and 128 then raise exception 'INVALID_DEVICE_ID'; end if;
 select * into v_s from public.study_sessions where id=p_session_id for update;
 if not found then raise exception 'SESSION_NOT_FOUND'; end if;
 if not private.is_group_member(v_s.group_id) then raise exception 'NOT_COMMUNITY_MEMBER' using errcode='42501'; end if;
 if v_s.status in('completed','canceled') then raise exception 'SESSION_CLOSED'; end if;
 select * into v_p from public.study_session_participants where session_id=p_session_id and user_id=v_user for update;
 if not found then
  if v_s.access_type<>'group' then raise exception 'INVITATION_REQUIRED' using errcode='42501'; end if;
  insert into public.study_session_participants(session_id,user_id,attendance_state,first_joined_at) values(p_session_id,v_user,'present',now()) returning * into v_p;
 else
  update public.study_session_participants set attendance_state='present',first_joined_at=coalesce(first_joined_at,now()),updated_at=now() where id=v_p.id returning * into v_p;
  update public.study_session_invitations set status='accepted',responded_at=now() where session_id=p_session_id and invitee_id=v_user and status='pending';
 end if;
 insert into public.study_session_devices(session_id,participant_id,device_id) values(p_session_id,v_p.id,v_device)
 on conflict(session_id,participant_id,device_id) do update set last_seen_at=now(),connection_state='connected';
 if not exists(select 1 from public.study_session_intervals where session_id=p_session_id and participant_id=v_p.id and left_at is null) then
  insert into public.study_session_intervals(session_id,participant_id) values(p_session_id,v_p.id);
 end if;
 insert into public.study_session_events(session_id,actor_id,event_type,payload) values(p_session_id,v_user,'participant.joined',jsonb_build_object('participant_id',v_p.id,'device_id',v_device));
 return jsonb_build_object('participant_id',v_p.id,'status',v_s.status,'started_at',v_s.started_at,'running_since',v_s.running_since,'accumulated_study_seconds',v_s.accumulated_study_seconds,'planned_duration_seconds',v_s.planned_duration_seconds);
end; $$;

create or replace function public.heartbeat_study_session(p_session_id uuid,p_device_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 update public.study_session_devices d set last_seen_at=now(),connection_state='connected' from public.study_session_participants p
 where d.session_id=p_session_id and d.device_id=p_device_id and d.participant_id=p.id and p.user_id=v_user;
 if not found then raise exception 'DEVICE_NOT_JOINED' using errcode='42501'; end if;
end; $$;

create or replace function public.leave_study_session(p_session_id uuid,p_device_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_pid uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select id into v_pid from public.study_session_participants where session_id=p_session_id and user_id=v_user;
 if v_pid is null then raise exception 'NOT_PARTICIPANT' using errcode='42501'; end if;
 update public.study_session_devices set connection_state='disconnected',last_seen_at=now() where session_id=p_session_id and participant_id=v_pid and device_id=p_device_id;
 if not exists(select 1 from public.study_session_devices where session_id=p_session_id and participant_id=v_pid and connection_state='connected' and last_seen_at>now()-interval '45 seconds') then
  update public.study_session_participants set attendance_state='left',last_left_at=now(),updated_at=now() where id=v_pid;
  update public.study_session_intervals set left_at=now() where session_id=p_session_id and participant_id=v_pid and left_at is null;
  delete from public.study_session_speaker_seats where session_id=p_session_id and participant_id=v_pid;
 end if;
 insert into public.study_session_events(session_id,actor_id,event_type,payload) values(p_session_id,v_user,'participant.left',jsonb_build_object('participant_id',v_pid,'device_id',p_device_id));
end; $$;

create or replace function public.set_study_session_state(p_session_id uuid,p_action text)
returns public.study_sessions language plpgsql security definer set search_path='' as $$
declare v_s public.study_sessions%rowtype; v_user uuid:=auth.uid(); v_now timestamptz:=now();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into v_s from public.study_sessions where id=p_session_id for update;
 if not found or not private.is_session_moderator(p_session_id) then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
 if p_action='start' and v_s.status='scheduled' then
  update public.study_sessions set status='active',started_at=v_now,running_since=v_now,updated_at=v_now where id=p_session_id returning * into v_s;
 elsif p_action='pause' and v_s.status='active' then
  update public.study_sessions set status='paused',accumulated_study_seconds=accumulated_study_seconds+greatest(0,floor(extract(epoch from(v_now-running_since)))::integer),running_since=null,updated_at=v_now where id=p_session_id returning * into v_s;
 elsif p_action='resume' and v_s.status='paused' then
  update public.study_sessions set status='active',running_since=v_now,updated_at=v_now where id=p_session_id returning * into v_s;
 elsif p_action='complete' and v_s.status in('active','paused') then
  update public.study_sessions set status='completed',accumulated_study_seconds=least(planned_duration_seconds,accumulated_study_seconds+case when status='active' then greatest(0,floor(extract(epoch from(v_now-running_since)))::integer) else 0 end),running_since=null,ended_at=v_now,updated_at=v_now where id=p_session_id returning * into v_s;
 elsif p_action='cancel' and v_s.status in('scheduled','active','paused') then
  update public.study_sessions set status='canceled',running_since=null,ended_at=v_now,updated_at=v_now where id=p_session_id returning * into v_s;
 else raise exception 'INVALID_SESSION_TRANSITION'; end if;
 insert into public.study_session_events(session_id,actor_id,event_type,payload) values(p_session_id,v_user,'session.'||p_action,jsonb_build_object('status',v_s.status));
 return v_s;
end; $$;

create or replace function public.request_session_pause(p_session_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_s public.study_sessions%rowtype; v_id uuid; v_electorate uuid[];
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into v_s from public.study_sessions where id=p_session_id for update;
 if not found or v_s.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
 select array_agg(p.user_id order by p.user_id) into v_electorate from public.study_session_participants p
 where p.session_id=p_session_id and p.attendance_state='present'
 and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds');
 if not(v_user=any(coalesce(v_electorate,'{}'::uuid[]))) then raise exception 'PRESENCE_REQUIRED' using errcode='42501'; end if;
 insert into public.study_session_pause_requests(session_id,requested_by,electorate,policy,expires_at)
 values(p_session_id,v_user,coalesce(v_electorate,'{}'::uuid[]),jsonb_build_object('electorate','snapshot_at_request','quorum','strict_majority','expiration_seconds',120,'provisional',true),now()+interval '120 seconds') returning id into v_id;
 return v_id;
end; $$;

create or replace function public.vote_session_pause(p_request_id uuid,p_vote text)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_r public.study_session_pause_requests%rowtype; v_total integer; v_yes integer; v_no integer;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_vote not in('yes','no') then raise exception 'INVALID_VOTE'; end if;
 select * into v_r from public.study_session_pause_requests where id=p_request_id for update;
 if not found or v_r.status<>'pending' then raise exception 'VOTE_CLOSED'; end if;
 if v_r.expires_at<=now() then update public.study_session_pause_requests set status='expired',resolved_at=now() where id=p_request_id; return 'expired'; end if;
 if not(v_user=any(v_r.electorate)) then raise exception 'NOT_IN_ELECTORATE' using errcode='42501'; end if;
 insert into public.study_session_pause_votes(request_id,voter_id,vote) values(p_request_id,v_user,p_vote);
 select count(*) filter(where vote='yes'),count(*) filter(where vote='no') into v_yes,v_no from public.study_session_pause_votes where request_id=p_request_id;
 v_total:=coalesce(array_length(v_r.electorate,1),0);
 if v_yes>floor(v_total/2.0) then
  update public.study_session_pause_requests set status='approved',yes_count=v_yes,no_count=v_no,resolved_at=now() where id=p_request_id;
  perform public.set_study_session_state(v_r.session_id,'pause');return 'approved';
 elsif v_no>floor(v_total/2.0) then
  update public.study_session_pause_requests set status='rejected',yes_count=v_yes,no_count=v_no,resolved_at=now() where id=p_request_id;return 'rejected';
 end if;
 update public.study_session_pause_requests set yes_count=v_yes,no_count=v_no where id=p_request_id;return 'pending';
end; $$;

create or replace function public.request_speaker_seat(p_session_id uuid,p_target_user uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_target_pid uuid; v_id uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if v_user=p_target_user then raise exception 'CANNOT_REQUEST_OWN_SEAT'; end if;
 select id into v_target_pid from public.study_session_participants where session_id=p_session_id and user_id=p_target_user and attendance_state='present';
 if v_target_pid is null or not exists(select 1 from public.study_session_speaker_seats where session_id=p_session_id and participant_id=v_target_pid) then raise exception 'TARGET_NOT_SPEAKER';end if;
 if not exists(select 1 from public.study_session_participants where session_id=p_session_id and user_id=v_user and attendance_state='present') then raise exception 'NOT_PRESENT'; end if;
 if exists(select 1 from public.study_session_speaker_seats ss join public.study_session_participants p on p.id=ss.participant_id where ss.session_id=p_session_id and p.user_id=v_user) then raise exception 'ALREADY_SPEAKER'; end if;
 insert into public.study_session_seat_requests(session_id,requester_id,target_participant_id,expires_at,policy)
 values(p_session_id,v_user,v_target_pid,now()+interval '60 seconds',jsonb_build_object('expiration_seconds',60,'queue_priority','first_accepted','provisional',true)) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.respond_speaker_seat_request(p_request_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_r public.study_session_seat_requests%rowtype; v_seat smallint;v_requester_pid uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into v_r from public.study_session_seat_requests where id=p_request_id for update;
 if not found or v_r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
 if v_r.expires_at<=now() then update public.study_session_seat_requests set status='expired',responded_at=now() where id=p_request_id;return 'expired';end if;
 if not exists(select 1 from public.study_session_participants where id=v_r.target_participant_id and user_id=v_user and attendance_state='present') then raise exception 'ONLY_SELECTED_SPEAKER_CAN_RESPOND' using errcode='42501';end if;
 if not p_accept then update public.study_session_seat_requests set status='rejected',responded_by=v_user,responded_at=now() where id=p_request_id;return 'rejected';end if;
 perform 1 from public.study_sessions where id=v_r.session_id for update;
 select seat_number into v_seat from public.study_session_speaker_seats where session_id=v_r.session_id and participant_id=v_r.target_participant_id for update;
 if v_seat is null then raise exception 'SPEAKER_SEAT_ALREADY_RELEASED';end if;
 select id into v_requester_pid from public.study_session_participants where session_id=v_r.session_id and user_id=v_r.requester_id and attendance_state='present';
 if v_requester_pid is null then raise exception 'REQUESTER_NOT_PRESENT';end if;
 delete from public.study_session_speaker_seats where session_id=v_r.session_id and participant_id=v_r.target_participant_id;
 insert into public.study_session_speaker_seats(session_id,seat_number,participant_id,granted_by) values(v_r.session_id,v_seat,v_requester_pid,v_user);
 update public.study_session_seat_requests set status='accepted',responded_by=v_user,responded_at=now() where id=p_request_id;return 'accepted';
end; $$;

create or replace function public.release_speaker_seat(p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 delete from public.study_session_speaker_seats ss using public.study_session_participants p where ss.session_id=p_session_id and ss.participant_id=p.id and p.user_id=v_user;
end; $$;

create or replace function public.transfer_session_host(p_session_id uuid,p_new_host uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.study_session_participants where session_id=p_session_id and user_id=v_user and participant_role='host') then raise exception 'HOST_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.study_session_participants where session_id=p_session_id and user_id=p_new_host and attendance_state='present') then raise exception 'NEW_HOST_MUST_BE_PRESENT';end if;
 update public.study_session_participants set participant_role='moderator',updated_at=now() where session_id=p_session_id and user_id=v_user;
 update public.study_session_participants set participant_role='host',updated_at=now() where session_id=p_session_id and user_id=p_new_host;
 update public.study_sessions set host_id=p_new_host,updated_at=now() where id=p_session_id;
end; $$;

revoke all on function public.create_study_session(text,text,text,text,text,text,text,timestamptz,integer,uuid[],text[]) from public,anon;
revoke all on function public.join_study_session(uuid,text),public.heartbeat_study_session(uuid,text),public.leave_study_session(uuid,text),
 public.set_study_session_state(uuid,text),public.request_session_pause(uuid),public.vote_session_pause(uuid,text),
 public.request_speaker_seat(uuid,uuid),public.respond_speaker_seat_request(uuid,boolean),
 public.release_speaker_seat(uuid),public.transfer_session_host(uuid,uuid) from public,anon;
grant execute on function public.create_study_session(text,text,text,text,text,text,text,timestamptz,integer,uuid[],text[]) to authenticated;
grant execute on function public.join_study_session(uuid,text),public.heartbeat_study_session(uuid,text),public.leave_study_session(uuid,text),
 public.set_study_session_state(uuid,text),public.request_session_pause(uuid),public.vote_session_pause(uuid,text),
 public.request_speaker_seat(uuid,uuid),public.respond_speaker_seat_request(uuid,boolean),
 public.release_speaker_seat(uuid),public.transfer_session_host(uuid,uuid) to authenticated;
comment on table public.study_sessions is 'Authoritative shared Study session state. Solo sessions remain device-local and never create Agora rooms.';
comment on table public.study_session_pause_requests is 'Electorate snapshot and expiry are provisional technical policies; see docs/PHASE_2_DECISIONS.md.';
comment on table public.study_session_seat_requests is '60-second expiry and first-accepted processing are provisional technical policies; see docs/PHASE_2_DECISIONS.md.';
