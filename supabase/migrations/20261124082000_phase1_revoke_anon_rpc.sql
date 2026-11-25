-- Phase 1 security: explicitly remove default anon EXECUTE on privileged RPCs.
-- The earlier REVOKE FROM PUBLIC does not remove role-specific default grants.
revoke execute on function public.start_direct_conversation(uuid) from anon;
revoke execute on function public.create_group_conversation(text, uuid[]) from anon;
revoke execute on function public.add_conversation_members(uuid, uuid[]) from anon;
revoke execute on function public.pin_message(uuid, boolean) from anon;
revoke execute on function public.publish_story(uuid, text, text, text, text, uuid[]) from anon;
revoke execute on function public.mark_story_view(uuid) from anon;
revoke execute on function public.mark_message_read(uuid) from anon;
revoke execute on function public.edit_message(uuid, text) from anon;
revoke execute on function public.delete_message_for_everyone(uuid) from anon;
