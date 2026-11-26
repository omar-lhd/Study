begin;

create table if not exists public.study_session_notification_preferences(
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_session_starts boolean not null default true,
  notify_session_invites boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.study_session_notification_preferences enable row level security;
drop policy if exists study_session_notification_preferences_select on public.study_session_notification_preferences;
create policy study_session_notification_preferences_select on public.study_session_notification_preferences
for select to authenticated using(user_id=auth.uid());
drop policy if exists study_session_notification_preferences_insert on public.study_session_notification_preferences;
create policy study_session_notification_preferences_insert on public.study_session_notification_preferences
for insert to authenticated with check(user_id=auth.uid());
drop policy if exists study_session_notification_preferences_update on public.study_session_notification_preferences;
create policy study_session_notification_preferences_update on public.study_session_notification_preferences
for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.study_session_notification_preferences to authenticated;

create or replace function private.notify_study_session_started()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_session_id uuid:=new.id;
begin
 if tg_op='INSERT' then
  if new.status<>'active' then return new; end if;
 else
  if new.status<>'active' or old.status='active' or old.started_at is not null then return new; end if;
 end if;

 insert into public.in_app_notifications(recipient_id,actor_id,notification_type,payload)
 select distinct recipient.user_id,new.host_id,'study_session_started',
   jsonb_build_object('session_id',new.id,'group_id',new.group_id,'title',new.title,'subject',new.subject,'message','بدأت جلسة مذاكرة جديدة')
 from (
   select gm.user_id
   from public.group_members gm
   where new.access_type='group' and gm.group_id=new.group_id and gm.user_id<>new.host_id
     and coalesce((select pref.notify_session_starts from public.study_session_notification_preferences pref where pref.user_id=gm.user_id),true)
   union
   select inv.invitee_id
   from public.study_session_invitations inv
   where inv.session_id=new.id and inv.invitee_id<>new.host_id
     and coalesce((select pref.notify_session_starts from public.study_session_notification_preferences pref where pref.user_id=inv.invitee_id),true)
 ) recipient;
 return new;
end;
$function$;

create or replace function private.notify_study_session_invitation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_title text;
begin
 if new.status<>'pending' then return new; end if;
 if not coalesce((select pref.notify_session_invites from public.study_session_notification_preferences pref where pref.user_id=new.invitee_id),true) then return new; end if;
 select title into v_title from public.study_sessions where id=new.session_id;
 insert into public.in_app_notifications(recipient_id,actor_id,notification_type,payload)
 values(new.invitee_id,new.inviter_id,'study_session_invitation',
  jsonb_build_object('session_id',new.session_id,'title',coalesce(v_title,'جلسة مذاكرة'),'message','تمت دعوتك إلى جلسة مذاكرة'));
 return new;
end;
$function$;

drop trigger if exists notify_study_session_started on public.study_sessions;
create trigger notify_study_session_started
after insert or update of status,started_at on public.study_sessions
for each row execute function private.notify_study_session_started();

drop trigger if exists notify_study_session_invitation on public.study_session_invitations;
create trigger notify_study_session_invitation
after insert on public.study_session_invitations
for each row execute function private.notify_study_session_invitation();

commit;
