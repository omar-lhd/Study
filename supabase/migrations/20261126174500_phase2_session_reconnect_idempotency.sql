-- Idempotent multi-device session event processing and missing invitation/role protections.
create or replace function public.join_study_session(p_session_id uuid,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); v_s public.study_sessions%rowtype; v_p public.study_session_participants%rowtype;
 v_device text:=trim(coalesce(p_device_id,'')); v_was_present boolean; v_device_created boolean;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if char_length(v_device) not between 12 and 128 then raise exception 'INVALID_DEVICE_ID'; end if;
 select * into v_s from public.study_sessions where id=p_session_id for update;
 if not found then raise exception 'SESSION_NOT_FOUND'; end if;
 if not private.is_study_community_member(v_s.group_id,v_s.created_by) then raise exception 'NOT_COMMUNITY_MEMBER' using errcode='42501'; end if;
 if v_s.status in('completed','canceled') then raise exception 'SESSION_CLOSED'; end if;
 select * into v_p from public.study_session_participants where session_id=p_session_id and user_id=v_user for update;
 if not found then
  if v_s.access_type<>'group' then raise exception 'INVITATION_REQUIRED' using errcode='42501'; end if;
  insert into public.study_session_participants(session_id,user_id,attendance_state,first_joined_at)
  values(p_session_id,v_user,'present',now()) returning * into v_p;
 else
  if v_p.attendance_state='invited' then raise exception 'INVITATION_RESPONSE_REQUIRED' using errcode='42501'; end if;
  update public.study_session_participants set attendance_state='present',first_joined_at=coalesce(first_joined_at,now()),updated_at=now()
   where id=v_p.id returning * into v_p;
 end if;
 insert into public.study_session_devices(session_id,participant_id,device_id)
 values(p_session_id,v_p.id,v_device) on conflict(session_id,participant_id,device_id) do update set last_seen_at=now(),connection_state='connected';
 select (xmax=0) into v_device_created from public.study_session_devices where session_id=p_session_id and participant_id=v_p.id and device_id=v_device;
 if not exists(select 1 from public.study_session_intervals where session_id=p_session_id and participant_id=v_p.id and left_at is null) then
  insert into public.study_session_intervals(session_id,participant_id) values(p_session_id,v_p.id);
 end if;
 if v_device_created then
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'participant.device_joined',jsonb_build_object('participant_id',v_p.id,'device_id',v_device));
 end if;
 return jsonb_build_object('participant_id',v_p.id,'status',v_s.status,'started_at',v_s.started_at,
  'running_since',v_s.running_since,'accumulated_study_seconds',v_s.accumulated_study_seconds,
  'planned_duration_seconds',v_s.planned_duration_seconds);
end;
$$;

create or replace function public.leave_study_session(p_session_id uuid,p_device_id text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_pid uuid;v_exists boolean;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select id into v_pid from public.study_session_participants where session_id=p_session_id and user_id=v_user;
 if v_pid is null then raise exception 'NOT_PARTICIPANT' using errcode='42501'; end if;
 update public.study_session_devices set connection_state='disconnected',last_seen_at=now()
  where session_id=p_session_id and participant_id=v_pid and device_id=p_device_id and connection_state<>'disconnected';
 get diagnostics v_exists = row_count;
 if v_exists then
  if not exists(select 1 from public.study_session_devices where session_id=p_session_id and participant_id=v_pid and connection_state='connected' and last_seen_at>now()-interval '45 seconds') then
   update public.study_session_participants set attendance_state='left',last_left_at=now(),updated_at=now() where id=v_pid;
   update public.study_session_intervals set left_at=now() where session_id=p_session_id and participant_id=v_pid and left_at is null;
   delete from public.study_session_speaker_seats where session_id=p_session_id and participant_id=v_pid;
  end if;
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'participant.device_left',jsonb_build_object('participant_id',v_pid,'device_id',p_device_id));
 end if;
end;
$$;

create or replace function public.respond_study_session_invitation(p_session_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_status text;v_s public.study_sessions%rowtype;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select i.status,s.* into v_status,v_s from public.study_session_invitations i
 join public.study_sessions s on s.id=i.session_id
 where i.session_id=p_session_id and i.invitee_id=v_user for update of i,s;
 if not found or v_status<>'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
 if not private.is_study_community_member(v_s.group_id,v_s.created_by) then raise exception 'NOT_COMMUNITY_MEMBER' using errcode='42501'; end if;
 update public.study_session_invitations set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
 where session_id=p_session_id and invitee_id=v_user;
 update public.study_session_participants set attendance_state=case when p_accept then 'invited' else 'left' end,
   last_left_at=case when p_accept then last_left_at else now() end,updated_at=now()
 where session_id=p_session_id and user_id=v_user;
 insert into public.study_session_events(session_id,actor_id,event_type,payload)
 values(p_session_id,v_user,case when p_accept then 'invitation.accepted' else 'invitation.declined' end,'{}'::jsonb);
 return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

create or replace function public.request_session_pause(p_session_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_s public.study_sessions%rowtype;v_id uuid;v_electorate uuid[];
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into v_s from public.study_sessions where id=p_session_id for update;
 if not found or v_s.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
 select array_agg(p.user_id order by p.user_id) into v_electorate
 from public.study_session_participants p
 where p.session_id=p_session_id and p.attendance_state='present'
 and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds');
 if not (v_user=any(coalesce(v_electorate,'{}'::uuid[]))) then raise exception 'PRESENCE_REQUIRED' using errcode='42501'; end if;
 insert into public.study_session_pause_requests(session_id,requested_by,electorate,policy,expires_at)
 values(p_session_id,v_user,coalesce(v_electorate,'{}'::uuid[]),
  jsonb_build_object('electorate','snapshot_at_request','quorum','strict_majority','expiration_seconds',120,'provisional',true),
  now()+interval '120 seconds') returning id into v_id;
 return v_id;
end;
$$;
