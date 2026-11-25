-- Phase 1 follow-up: server-authored delivery receipts and safe read/edit/delete operations.
-- Additive and idempotent; no existing rows are deleted.

alter table public.messages drop constraint if exists messages_reply_to_message_id_conversation_id_fkey;
alter table public.messages add constraint messages_reply_to_message_id_conversation_id_fkey
  foreign key (reply_to_message_id, conversation_id)
  references public.messages(id, conversation_id)
  on delete set null (reply_to_message_id);

create or replace function private.on_message_inserted()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_kind text;
begin
  update public.conversations set last_message_at = new.created_at, updated_at = now()
    where id = new.conversation_id;
  select kind into v_kind from public.conversations where id = new.conversation_id;

  insert into public.message_receipts(message_id, user_id, delivered_at)
    select new.id, cm.user_id, now()
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
    on conflict (message_id, user_id) do nothing;

  insert into public.in_app_notifications(recipient_id, actor_id, notification_type, payload)
    select cm.user_id, new.sender_id,
      case when v_kind = 'direct' then 'private_message' else 'group_message' end,
      jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
      and not cm.muted;
  return new;
end;
$$;

create or replace function public.mark_message_read(p_message_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_conversation uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select conversation_id into v_conversation from public.messages where id = p_message_id;
  if v_conversation is null or not private.is_conversation_member(v_conversation) then raise exception 'Message not found'; end if;

  insert into public.message_receipts(message_id, user_id, delivered_at, read_at)
    values (p_message_id, auth.uid(), now(), now())
    on conflict (message_id, user_id)
    do update set delivered_at = coalesce(public.message_receipts.delivered_at, excluded.delivered_at),
                  read_at = coalesce(public.message_receipts.read_at, excluded.read_at);

  update public.conversation_members
    set last_read_at = now(), last_read_message_id = p_message_id
    where conversation_id = v_conversation and user_id = auth.uid();
end;
$$;

create or replace function public.edit_message(p_message_id uuid, p_content text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_content, ''))) not between 1 and 10000 then raise exception 'Message content must be 1-10000 characters'; end if;
  update public.messages
    set content = p_content, edited_at = now(), updated_at = now()
    where id = p_message_id and sender_id = auth.uid()
      and created_at >= now() - interval '15 minutes'
      and private.is_conversation_member(conversation_id)
      and deleted_at is null;
  if not found then raise exception 'Message cannot be edited'; end if;
end;
$$;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.messages
    set content = '', deleted_at = now(), deleted_for_everyone = true,
        updated_at = now(), pinned_at = null, pinned_by = null
    where id = p_message_id and sender_id = auth.uid()
      and created_at >= now() - interval '60 minutes'
      and private.is_conversation_member(conversation_id)
      and deleted_at is null;
  if not found then raise exception 'Message cannot be deleted for everyone'; end if;
end;
$$;

revoke all on function public.mark_message_read(uuid) from public;
revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.delete_message_for_everyone(uuid) from public;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
