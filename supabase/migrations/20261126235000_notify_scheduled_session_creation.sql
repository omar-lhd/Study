begin;
create or replace function private.notify_study_session_started()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_type text; v_message text;
begin
 if tg_op='INSERT' then
  if new.status='active' then v_type:='study_session_started';v_message:='بدأت جلسة مذاكرة جديدة';
  elsif new.status='scheduled' then v_type:='study_session_created';v_message:='تم إنشاء جلسة مذاكرة مجدولة';
  else return new; end if;
 else
  if new.status<>'active' or old.status='active' or old.started_at is not null then return new; end if;
  v_type:='study_session_started';v_message:='بدأت جلسة مذاكرة جديدة';
 end if;

 insert into public.in_app_notifications(recipient_id,actor_id,notification_type,payload)
 select distinct recipient.user_id,new.host_id,v_type,
  jsonb_build_object('session_id',new.id,'group_id',new.group_id,'title',new.title,'subject',new.subject,'message',v_message)
 from (
  select gm.user_id from public.group_members gm
  where new.access_type='group' and gm.group_id=new.group_id and gm.user_id<>new.host_id
   and coalesce((select pref.notify_session_starts from public.study_session_notification_preferences pref where pref.user_id=gm.user_id),true)
  union
  select inv.invitee_id from public.study_session_invitations inv
  where inv.session_id=new.id and inv.invitee_id<>new.host_id
   and coalesce((select pref.notify_session_starts from public.study_session_notification_preferences pref where pref.user_id=inv.invitee_id),true)
 ) recipient;
 return new;
end;
$function$;
commit;
