-- Extend group chat with private image attachments; keep original text flow backwards compatible.
alter table public.study_session_chat
  add column if not exists message_type text not null default 'text',
  add column if not exists storage_path text,
  add column if not exists doodle_path text;

alter table public.study_session_chat
  drop constraint if exists study_session_chat_message_type_check;
alter table public.study_session_chat
  add constraint study_session_chat_message_type_check
  check (message_type in ('text','image'));

alter table public.study_session_chat
  drop constraint if exists study_session_chat_attachment_path_check;
alter table public.study_session_chat
  add constraint study_session_chat_attachment_path_check
  check (
    (message_type='text' and storage_path is null and doodle_path is null)
    or
    (message_type='image' and storage_path is not null)
  );

-- A private bucket. The path starts with the session UUID and uploader UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('study-session-chat','study-session-chat',false,12582912,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=12582912,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists study_session_chat_image_select on storage.objects;
create policy study_session_chat_image_select on storage.objects
for select to authenticated
using (
  bucket_id='study-session-chat'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and private.is_session_participant(split_part(name,'/',1)::uuid)
);

drop policy if exists study_session_chat_image_insert on storage.objects;
create policy study_session_chat_image_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='study-session-chat'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)=(select auth.uid())::text
  and private.is_present_session_participant(split_part(name,'/',1)::uuid)
);

drop policy if exists study_session_chat_image_delete on storage.objects;
create policy study_session_chat_image_delete on storage.objects
for delete to authenticated
using (
  bucket_id='study-session-chat'
  and split_part(name,'/',2)=(select auth.uid())::text
  and private.is_present_session_participant(split_part(name,'/',1)::uuid)
);

revoke all on function public.set_my_session_personal_status(uuid,text) from public,anon;
revoke all on function public.complete_expired_study_session(uuid) from public,anon;
revoke all on function public.cleanup_stale_study_session_presence(uuid) from public,anon;
revoke all on function public.expire_study_session_votes(uuid) from public,anon;
revoke all on function public.propose_session_time_change(uuid,integer) from public,anon;
revoke all on function public.vote_session_time_change(uuid,text) from public,anon;
grant execute on function public.set_my_session_personal_status(uuid,text) to authenticated;
grant execute on function public.complete_expired_study_session(uuid) to authenticated;
grant execute on function public.cleanup_stale_study_session_presence(uuid) to authenticated;
grant execute on function public.expire_study_session_votes(uuid) to authenticated;
grant execute on function public.propose_session_time_change(uuid,integer) to authenticated;
grant execute on function public.vote_session_time_change(uuid,text) to authenticated;

notify pgrst,'reload schema';
