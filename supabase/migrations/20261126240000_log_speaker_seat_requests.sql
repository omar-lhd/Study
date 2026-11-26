begin;
create or replace function private.log_study_session_seat_request_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid;v_event text;
begin
 if tg_op='INSERT' then
  v_actor:=new.requester_id;v_event:='speaker.seat_requested';
 else
  if new.status is not distinct from old.status then return new; end if;
  v_actor:=coalesce(new.responded_by,auth.uid());
  v_event:=case new.status when 'accepted' then 'speaker.seat_request_accepted' when 'rejected' then 'speaker.seat_request_rejected' when 'expired' then 'speaker.seat_request_expired' else 'speaker.seat_request_updated' end;
 end if;
 insert into public.study_session_events(session_id,actor_id,event_type,payload)
 values(new.session_id,v_actor,v_event,jsonb_build_object('request_id',new.id,'requester_id',new.requester_id,'target_participant_id',new.target_participant_id,'status',new.status));
 return new;
end;
$function$;
drop trigger if exists log_study_session_seat_request_event on public.study_session_seat_requests;
create trigger log_study_session_seat_request_event
after insert or update of status on public.study_session_seat_requests
for each row execute function private.log_study_session_seat_request_event();
commit;
