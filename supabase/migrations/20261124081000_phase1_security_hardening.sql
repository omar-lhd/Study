-- Phase 1 security hardening: prevent self-promotion and client-forged system fields.
-- Keep clients on narrow column grants; privileged transitions go through authenticated RPCs.

drop policy if exists profiles_update_policy on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, username, bio, profile_metadata, updated_at)
  on public.profiles to authenticated;

drop policy if exists conversation_members_update_self on public.conversation_members;
create policy conversation_members_update_self on public.conversation_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_conversation_member(conversation_id));

revoke update on public.conversation_members from authenticated;
grant update (last_read_at, last_read_message_id, muted, pinned)
  on public.conversation_members to authenticated;

revoke update on public.messages from authenticated;
-- Editing, pinning and delete-for-everyone are exposed only through guarded RPCs.

revoke update on public.message_receipts from authenticated;
revoke insert on public.message_receipts from authenticated;
-- Receipt rows are written by the message trigger and mark_message_read RPC.

drop policy if exists stories_update_owner on public.stories;
revoke update on public.stories from authenticated;
-- Published story audience and expiry are immutable to clients; owners can delete their story.

drop policy if exists notifications_update_recipient on public.in_app_notifications;
create policy notifications_update_recipient on public.in_app_notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
revoke update on public.in_app_notifications from authenticated;
grant update (read_at) on public.in_app_notifications to authenticated;

drop policy if exists chat_media_update_owner on storage.objects;
-- Private uploads use unique paths and INSERT-only access; no client-side object moves/upserts.
