create or replace function private.is_study_community_member(p_group_id uuid,p_creator_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.group_members gm join public.study_groups sg on sg.id=gm.group_id
  where gm.group_id=p_group_id and gm.user_id=(select auth.uid()) and sg.created_by=p_creator_id);
$$;
revoke all on function private.is_study_community_member(uuid,uuid) from public,anon;
grant execute on function private.is_study_community_member(uuid,uuid) to authenticated;
drop policy if exists study_sessions_select on public.study_sessions;
create policy study_sessions_select on public.study_sessions for select to authenticated
 using(private.is_study_community_member(group_id,created_by) and
  (access_type='group' or created_by=(select auth.uid()) or private.is_session_participant(id)));

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
 select gm.group_id into v_group from public.group_members gm
  join public.study_groups sg on sg.id=gm.group_id
  where gm.user_id=v_user and sg.created_by=v_user
  order by gm.joined_at limit 1;
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
   if not exists(select 1 from public.group_members gm join public.study_groups sg on sg.id=gm.group_id
       where gm.group_id=v_group and gm.user_id=v_invitee and sg.created_by=v_user) then raise exception 'INVITEE_NOT_IN_COMMUNITY'; end if;
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
 if not exists(select 1 from public.group_members gm join public.study_groups sg on sg.id=gm.group_id
     where gm.group_id=v_s.group_id and gm.user_id=v_user and sg.created_by=v_s.created_by) then
   raise exception 'NOT_COMMUNITY_MEMBER' using errcode='42501';
 end if;
 if v_s.status in('completed','canceled') then raise exception 'SESSION_CLOSED'; end if;
 select * into v_p from public.study_session_participants where session_id=p_session_id and user_id=v_user for update;
 if not found then
  if v_s.access_type<>'group' or not exists(
    select 1 from public.group_members gm join public.study_groups sg on sg.id=gm.group_id
    where gm.group_id=v_s.group_id and gm.user_id=v_user and sg.created_by=v_s.created_by
  ) then raise exception 'INVITATION_REQUIRED' using errcode='42501'; end if;
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

