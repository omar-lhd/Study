begin;
create or replace function public.propose_session_time_change(p_session_id uuid,p_delta_seconds integer)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_s public.study_sessions%rowtype; v_electorate uuid[]; v_total integer; v_required integer; v_new_duration integer; v_id uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_delta_seconds is null or p_delta_seconds=0 or abs(p_delta_seconds)>28800 then raise exception 'INVALID_TIME_DELTA'; end if;
 select * into v_s from public.study_sessions where id=p_session_id for update;
 if not found or v_s.status not in('active','paused') then raise exception 'SESSION_NOT_ACTIVE'; end if;
 if not private.is_session_moderator(p_session_id) then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
 v_new_duration:=v_s.planned_duration_seconds+p_delta_seconds;
 if v_new_duration not between 300 and 28800 then raise exception 'DURATION_OUT_OF_RANGE'; end if;
 if not exists(select 1 from public.study_session_participants p where p.session_id=p_session_id and p.user_id=v_user and p.attendance_state='present' and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds')) then
  raise exception 'PRESENCE_REQUIRED' using errcode='42501';
 end if;
 select array_agg(p.user_id order by p.user_id) into v_electorate
 from public.study_session_participants p
 where p.session_id=p_session_id and p.attendance_state='present' and p.user_id<>v_user
 and exists(select 1 from public.study_session_devices d where d.session_id=p_session_id and d.participant_id=p.id and d.connection_state='connected' and d.last_seen_at>now()-interval '45 seconds');
 v_total:=coalesce(array_length(v_electorate,1),0);
 v_required:=case when v_total=0 then 0 else (v_total+2)/2 end;
 insert into public.study_session_time_change_requests(session_id,requested_by,delta_seconds,proposed_duration_seconds,electorate,yes_count,expires_at)
 values(p_session_id,v_user,p_delta_seconds,v_new_duration,coalesce(v_electorate,'{}'::uuid[]),0,now()+interval '60 seconds') returning id into v_id;
 insert into public.study_session_events(session_id,actor_id,event_type,payload)
 values(p_session_id,v_user,'session.time_change_requested',jsonb_build_object('request_id',v_id,'delta_seconds',p_delta_seconds,'proposed_duration_seconds',v_new_duration,'yes_count',0,'total',v_total,'required',v_required,'expires_in_seconds',60));
 if v_total=0 then
  update public.study_session_time_change_requests set status='approved',resolved_at=now() where id=v_id;
  update public.study_sessions set planned_duration_seconds=v_new_duration,updated_at=now() where id=p_session_id;
  insert into public.study_session_events(session_id,actor_id,event_type,payload)
  values(p_session_id,v_user,'session.time_changed',jsonb_build_object('request_id',v_id,'delta_seconds',p_delta_seconds,'planned_duration_seconds',v_new_duration));
 end if;
 return v_id;
end;
$function$;

create or replace function public.vote_session_time_change(p_request_id uuid,p_vote text)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_r public.study_session_time_change_requests%rowtype; v_total integer; v_required integer; v_yes integer; v_no integer;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_vote not in('yes','no') then raise exception 'INVALID_VOTE'; end if;
 select * into v_r from public.study_session_time_change_requests where id=p_request_id for update;
 if not found or v_r.status<>'pending' then raise exception 'VOTE_CLOSED'; end if;
 if v_r.expires_at<=now() then update public.study_session_time_change_requests set status='expired',resolved_at=now() where id=p_request_id; return 'expired'; end if;
 if not(v_user=any(v_r.electorate)) then raise exception 'NOT_IN_ELECTORATE' using errcode='42501'; end if;
 insert into public.study_session_time_change_votes(request_id,voter_id,vote) values(p_request_id,v_user,p_vote)
 on conflict(request_id,voter_id) do update set vote=excluded.vote,created_at=now();
 select count(*) filter(where vote='yes'),count(*) filter(where vote='no') into v_yes,v_no from public.study_session_time_change_votes where request_id=p_request_id;
 v_total:=coalesce(array_length(v_r.electorate,1),0);
 v_required:=case when v_total=0 then 0 else (v_total+2)/2 end;
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
notify pgrst,'reload schema';
commit;
