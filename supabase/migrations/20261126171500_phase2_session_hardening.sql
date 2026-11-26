-- Phase 2.1 additive hardening: authoritative duration, idempotent multi-device events,
-- seat capacity trigger and backend-driven invitation acceptance.
-- Existing migration created the base session schema and core RPCs.

create or replace function private.enforce_speaker_seat_capacity()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_limit smallint;
begin
  select max_speaker_seats into v_limit
  from public.study_sessions where id=new.session_id for update;
  if v_limit is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if (select count(*) from public.study_session_speaker_seats
      where session_id=new.session_id and (tg_op='INSERT' or participant_id<>new.participant_id)) >= v_limit then
    raise exception 'SPEAKER_SEAT_CAP_REACHED';
  end if;
  return new;
end;
$$;

drop trigger if exists study_session_speaker_seat_capacity on public.study_session_speaker_seats;
create trigger study_session_speaker_seat_capacity
before insert or update on public.study_session_speaker_seats
for each row execute function private.enforce_speaker_seat_capacity();

create or replace function public.respond_study_session_invitation(p_session_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_status text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select status into v_status from public.study_session_invitations
 where session_id=p_session_id and invitee_id=v_user for update;
 if not found or v_status<>'pending' then raise exception 'INVITATION_NOT_PENDING'; end if;
 update public.study_session_invitations set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
 where session_id=p_session_id and invitee_id=v_user;
 if p_accept then
  update public.study_session_participants set attendance_state='present',first_joined_at=coalesce(first_joined_at,now()),updated_at=now()
   where session_id=p_session_id and user_id=v_user;
  return 'accepted';
 end if;
 update public.study_session_participants set attendance_state='left',last_left_at=now(),updated_at=now()
  where session_id=p_session_id and user_id=v_user and attendance_state='invited';
 return 'declined';
end;
$$;

create or replace function public.get_study_session_snapshot(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_session public.study_sessions%rowtype; v_seconds bigint; v_pid uuid; v_is_present boolean;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into v_session from public.study_sessions where id=p_session_id;
 if not found or not private.is_session_participant(p_session_id) then raise exception 'NOT_SESSION_PARTICIPANT' using errcode='42501'; end if;
 v_seconds:=v_session.accumulated_study_seconds;
 if v_session.status='active' and v_session.running_since is not null then
  v_seconds:=v_seconds+greatest(0,floor(extract(epoch from(now()-v_session.running_since)))::bigint);
 end if;
 select id,attendance_state='present' into v_pid,v_is_present from public.study_session_participants
  where session_id=p_session_id and user_id=v_user;
 return jsonb_build_object(
  'id',v_session.id,'title',v_session.title,'subject',v_session.subject,'subject_color',v_session.subject_color,
  'session_type',v_session.session_type,'status',v_session.status,'access_type',v_session.access_type,
  'starts_at',v_session.starts_at,'started_at',v_session.started_at,'ended_at',v_session.ended_at,
  'planned_duration_seconds',v_session.planned_duration_seconds,'accumulated_study_seconds',v_seconds,
  'running_since',v_session.running_since,'server_now',now(),'host_id',v_session.host_id,
  'participant_id',v_pid,'is_present',coalesce(v_is_present,false),'allow_audio',v_session.allow_audio,
  'speaker_seat_count',(select count(*) from public.study_session_speaker_seats where session_id=p_session_id),
  'participant_count',(select count(*) from public.study_session_participants where session_id=p_session_id and attendance_state='present')
 );
end;
$$;

create or replace function public.add_session_speaker_seat(p_session_id uuid,p_user_id uuid)
returns smallint language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_pid uuid; v_seat smallint;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.is_session_moderator(p_session_id) then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
 select id into v_pid from public.study_session_participants where session_id=p_session_id and user_id=p_user_id and attendance_state='present';
 if v_pid is null then raise exception 'PARTICIPANT_NOT_PRESENT'; end if;
 if exists(select 1 from public.study_session_speaker_seats where session_id=p_session_id and participant_id=v_pid) then
  select seat_number into v_seat from public.study_session_speaker_seats where session_id=p_session_id and participant_id=v_pid;
  return v_seat;
 end if;
 select n into v_seat from generate_series(1,6) n
  where not exists(select 1 from public.study_session_speaker_seats s where s.session_id=p_session_id and s.seat_number=n)
  order by n limit 1;
 if v_seat is null then raise exception 'SPEAKER_SEAT_CAP_REACHED'; end if;
 insert into public.study_session_speaker_seats(session_id,seat_number,participant_id,granted_by)
 values(p_session_id,v_seat,v_pid,v_user);
 return v_seat;
end;
$$;

create or replace function public.remove_session_speaker_seat(p_session_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.is_session_moderator(p_session_id) then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
 delete from public.study_session_speaker_seats s using public.study_session_participants p
 where s.session_id=p_session_id and s.participant_id=p.id and p.user_id=p_user_id;
end;
$$;

create or replace function public.get_my_pending_session_invitations()
returns table(invitation_id uuid,session_id uuid,title text,session_type text,subject text,starts_at timestamptz,planned_duration_seconds integer,inviter_id uuid,inviter_name text,created_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select i.id,i.session_id,s.title,s.session_type,s.subject,s.starts_at,s.planned_duration_seconds,i.inviter_id,pr.display_name,i.created_at
 from public.study_session_invitations i
 join public.study_sessions s on s.id=i.session_id
 left join public.profiles pr on pr.id=i.inviter_id
 where i.invitee_id=(select auth.uid()) and i.status='pending'
 order by i.created_at desc;
$$;

revoke all on function public.respond_study_session_invitation(uuid,boolean),
 public.get_study_session_snapshot(uuid),public.add_session_speaker_seat(uuid,uuid),
 public.remove_session_speaker_seat(uuid,uuid),public.get_my_pending_session_invitations()
 from public,anon;
grant execute on function public.respond_study_session_invitation(uuid,boolean),
 public.get_study_session_snapshot(uuid),public.add_session_speaker_seat(uuid,uuid),
 public.remove_session_speaker_seat(uuid,uuid),public.get_my_pending_session_invitations()
 to authenticated;
