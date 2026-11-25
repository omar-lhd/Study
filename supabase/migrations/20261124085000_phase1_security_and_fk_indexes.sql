-- Remove unnecessary API-role EXECUTE grants from the existing event-trigger function.
-- Event triggers continue to run as configured; they are not callable as an RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Add indexes for Phase 1 foreign-key lookups and notification/message paths.
create index if not exists conversations_created_by_idx on public.conversations(created_by);
create index if not exists in_app_notifications_actor_idx on public.in_app_notifications(actor_id);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists message_attachments_conversation_idx on public.message_attachments(conversation_id);
create index if not exists message_attachments_message_conversation_idx on public.message_attachments(message_id, conversation_id);
create index if not exists message_reactions_user_idx on public.message_reactions(user_id);
create index if not exists messages_pinned_by_idx on public.messages(pinned_by);
create index if not exists messages_reply_to_conversation_idx on public.messages(reply_to_message_id, conversation_id);
create index if not exists story_audience_members_user_idx on public.story_audience_members(user_id);
create index if not exists story_reactions_user_idx on public.story_reactions(user_id);
create index if not exists story_views_viewer_idx on public.story_views(viewer_id);
