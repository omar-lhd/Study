-- Phase 1: identity, private community messaging, attachments, Stories and in-app notifications.
-- Additive only: preserves Package A, existing Sessions data and the existing group/invite foundation.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.profiles
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists profile_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-zA-Z0-9_]{3,24}$');
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 160);
alter table public.profiles drop constraint if exists profiles_profile_metadata_object;
alter table public.profiles add constraint profiles_profile_metadata_object
  check (jsonb_typeof(profile_metadata) = 'object');

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text,
  avatar_url text,
  created_by uuid not null references auth.users(id) on delete restrict,
  direct_key text unique,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_kind_key check (
    (kind = 'direct' and direct_key is not null and title is null)
    or (kind = 'group' and direct_key is null)
  ),
  constraint conversations_title_length check (title is null or char_length(title) between 1 and 80)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  last_read_message_id uuid,
  muted boolean not null default false,
  pinned boolean not null default false,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  content text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'voice')),
  reply_to_message_id uuid,
  forwarded_from_message_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_for_everyone boolean not null default false,
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, conversation_id),
  foreign key (reply_to_message_id, conversation_id)
    references public.messages(id, conversation_id) on delete set null,
  constraint messages_content_length check (char_length(content) <= 10000),
  constraint messages_content_or_attachment check (
    char_length(trim(content)) > 0 or message_type <> 'text'
  )
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  foreign key (message_id, conversation_id)
    references public.messages(id, conversation_id) on delete cascade
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, user_id),
  constraint receipt_read_requires_delivery check (read_at is null or delivered_at is not null)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  story_type text not null check (story_type in ('text', 'image')),
  text_content text not null default '',
  storage_path text,
  audience text not null default 'community' check (audience in ('community', 'selected-members')),
  status text not null default 'published' check (status in ('draft', 'published')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  constraint stories_content_valid check (
    (story_type = 'text' and char_length(trim(text_content)) between 1 and 500 and storage_path is null)
    or (story_type = 'image' and (storage_path is not null or char_length(trim(text_content)) > 0))
  )
);

create table if not exists public.story_audience_members (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (story_id, user_id)
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id, emoji)
);

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  notification_type text not null check (notification_type in (
    'private_message', 'group_message', 'group_member_added', 'story_reaction'
  )),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists conversation_members_user_recent
  on public.conversation_members (user_id, conversation_id);
create index if not exists conversations_activity
  on public.conversations (last_message_at desc nulls last);
create index if not exists messages_conversation_created
  on public.messages (conversation_id, created_at desc, id desc);
create index if not exists messages_sender_created
  on public.messages (sender_id, created_at desc);
create index if not exists message_receipts_user_read
  on public.message_receipts (user_id, read_at);
create index if not exists stories_active_owner
  on public.stories (owner_id, expires_at desc)
  where status = 'published';
create index if not exists stories_active_expiry
  on public.stories (expires_at)
  where status = 'published';
create index if not exists notifications_recipient_unread
  on public.in_app_notifications (recipient_id, created_at desc)
  where read_at is null;

-- Narrow security-definer predicates live in a non-exposed schema to avoid RLS recursion.
create or replace function private.is_community_member(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1 from public.group_members gm where gm.user_id = p_user_id
  );
$$;

create or replace function private.shares_community_group(p_user_a uuid, p_user_b uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p_user_a is not null and p_user_b is not null and exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = p_user_a and b.user_id = p_user_b
  );
$$;

create or replace function private.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
  );
$$;

create or replace function private.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid() and cm.role in ('owner', 'admin')
  );
$$;

create or replace function private.can_view_story(p_story_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null and exists (
    select 1 from public.stories s
    where s.id = p_story_id
      and s.status = 'published'
      and s.expires_at > now()
      and (
        s.owner_id = auth.uid()
        or (s.audience = 'community' and private.is_community_member(auth.uid()))
        or (s.audience = 'selected-members' and exists (
          select 1 from public.story_audience_members sam
          where sam.story_id = s.id and sam.user_id = auth.uid()
        ))
      )
  );
$$;

create or replace function private.can_access_message(p_message_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null and exists (
    select 1 from public.messages m
    where m.id = p_message_id
      and private.is_conversation_member(m.conversation_id)
  );
$$;

revoke all on all functions in schema private from public;
grant execute on function private.is_community_member(uuid) to authenticated;
grant execute on function private.shares_community_group(uuid, uuid) to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.is_conversation_admin(uuid) to authenticated;
grant execute on function private.can_view_story(uuid) to authenticated;
grant execute on function private.can_access_message(uuid) to authenticated;

-- Existing profile bootstrap trigger is idempotent (ON CONFLICT DO NOTHING).
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_receipts enable row level security;
alter table public.stories enable row level security;
alter table public.story_audience_members enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.in_app_notifications enable row level security;

create policy conversations_select_members on public.conversations
  for select to authenticated using (private.is_conversation_member(id));
create policy conversations_update_admin on public.conversations
  for update to authenticated using (private.is_conversation_admin(id))
  with check (private.is_conversation_admin(id));

create policy conversation_members_select_members on public.conversation_members
  for select to authenticated using (private.is_conversation_member(conversation_id));
create policy conversation_members_update_self on public.conversation_members
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and private.is_conversation_member(conversation_id));
create policy conversation_members_delete_self_or_admin on public.conversation_members
  for delete to authenticated using (user_id = auth.uid() or private.is_conversation_admin(conversation_id));

create policy messages_select_members on public.messages
  for select to authenticated using (private.is_conversation_member(conversation_id));
create policy messages_insert_sender_member on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and private.is_conversation_member(conversation_id)
    and (reply_to_message_id is null or exists (
      select 1 from public.messages reply
      where reply.id = reply_to_message_id and reply.conversation_id = conversation_id
    ))
    and (forwarded_from_message_id is null or private.can_access_message(forwarded_from_message_id))
  );
create policy messages_update_sender_recent on public.messages
  for update to authenticated
  using (sender_id = auth.uid() and created_at >= now() - interval '15 minutes')
  with check (sender_id = auth.uid() and private.is_conversation_member(conversation_id));
create policy messages_delete_sender_or_admin on public.messages
  for delete to authenticated
  using (sender_id = auth.uid() or private.is_conversation_admin(conversation_id));

create policy message_attachments_select_members on public.message_attachments
  for select to authenticated using (private.is_conversation_member(conversation_id));
create policy message_attachments_insert_sender on public.message_attachments
  for insert to authenticated with check (
    exists (select 1 from public.messages m
      where m.id = message_id and m.conversation_id = conversation_id and m.sender_id = auth.uid())
  );
create policy message_attachments_delete_sender on public.message_attachments
  for delete to authenticated using (
    exists (select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid())
  );

create policy reactions_select_members on public.message_reactions
  for select to authenticated using (private.can_access_message(message_id));
create policy reactions_insert_self on public.message_reactions
  for insert to authenticated with check (user_id = auth.uid() and private.can_access_message(message_id));
create policy reactions_delete_self on public.message_reactions
  for delete to authenticated using (user_id = auth.uid() and private.can_access_message(message_id));

create policy receipts_select_members on public.message_receipts
  for select to authenticated using (private.can_access_message(message_id));
create policy receipts_insert_self on public.message_receipts
  for insert to authenticated with check (user_id = auth.uid() and private.can_access_message(message_id));
create policy receipts_update_self on public.message_receipts
  for update to authenticated using (user_id = auth.uid() and private.can_access_message(message_id))
  with check (user_id = auth.uid() and private.can_access_message(message_id));

create policy stories_select_audience on public.stories
  for select to authenticated using (private.can_view_story(id));
create policy stories_insert_owner on public.stories
  for insert to authenticated with check (owner_id = auth.uid() and private.is_community_member(auth.uid()));
create policy stories_update_owner on public.stories
  for update to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy stories_delete_owner on public.stories
  for delete to authenticated using (owner_id = auth.uid());

create policy story_audience_select_owner_or_self on public.story_audience_members
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.owner_id = auth.uid())
  );
create policy story_audience_insert_owner on public.story_audience_members
  for insert to authenticated with check (
    exists (select 1 from public.stories s where s.id = story_id and s.owner_id = auth.uid())
    and private.is_community_member(user_id)
    and private.shares_community_group(auth.uid(), user_id)
  );

create policy story_views_select_owner on public.story_views
  for select to authenticated using (
    exists (select 1 from public.stories s where s.id = story_id and s.owner_id = auth.uid())
  );
create policy story_views_insert_viewer on public.story_views
  for insert to authenticated with check (viewer_id = auth.uid() and private.can_view_story(story_id));
create policy story_views_update_viewer on public.story_views
  for update to authenticated using (viewer_id = auth.uid() and private.can_view_story(story_id))
  with check (viewer_id = auth.uid() and private.can_view_story(story_id));

create policy story_reactions_select_owner_or_audience on public.story_reactions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.owner_id = auth.uid())
    or private.can_view_story(story_id)
  );
create policy story_reactions_insert_audience on public.story_reactions
  for insert to authenticated with check (user_id = auth.uid() and private.can_view_story(story_id));
create policy story_reactions_delete_self on public.story_reactions
  for delete to authenticated using (user_id = auth.uid() and private.can_view_story(story_id));

create policy notifications_select_recipient on public.in_app_notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update_recipient on public.in_app_notifications
  for update to authenticated using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- RPCs are guarded by auth.uid(), and only callable by authenticated members.
create or replace function public.start_direct_conversation(p_other_user uuid)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_conversation uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_other_user is null or p_other_user = v_user then raise exception 'Choose another community member'; end if;
  if not private.is_community_member(v_user) or not private.is_community_member(p_other_user)
     or not private.shares_community_group(v_user, p_other_user) then
    raise exception 'Conversation is only available to eligible community members';
  end if;
  v_key := least(v_user::text, p_other_user::text) || ':' || greatest(v_user::text, p_other_user::text);
  insert into public.conversations(kind, created_by, direct_key)
    values ('direct', v_user, v_key)
    on conflict (direct_key) do nothing;
  select id into v_conversation from public.conversations where direct_key = v_key;
  insert into public.conversation_members(conversation_id, user_id, role)
    values (v_conversation, v_user, 'owner'), (v_conversation, p_other_user, 'member')
    on conflict (conversation_id, user_id) do nothing;
  return v_conversation;
end;
$$;

create or replace function public.create_group_conversation(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_conversation uuid;
  v_member uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_community_member(v_user) then raise exception 'Approved community membership required'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 80 then raise exception 'Group name must be 1-80 characters'; end if;
  insert into public.conversations(kind, title, created_by) values ('group', trim(p_title), v_user) returning id into v_conversation;
  insert into public.conversation_members(conversation_id, user_id, role) values (v_conversation, v_user, 'owner');
  for v_member in select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) loop
    if v_member <> v_user then
      if not private.is_community_member(v_member) or not private.shares_community_group(v_user, v_member) then
        raise exception 'All participants must be eligible members of your private community';
      end if;
      insert into public.conversation_members(conversation_id, user_id, role)
        values (v_conversation, v_member, 'member') on conflict do nothing;
    end if;
  end loop;
  return v_conversation;
end;
$$;

create or replace function public.add_conversation_members(p_conversation_id uuid, p_member_ids uuid[])
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_member uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null or not private.is_conversation_admin(p_conversation_id) then raise exception 'Group admin permission required'; end if;
  if (select kind from public.conversations where id = p_conversation_id) <> 'group' then raise exception 'Only group conversations support additional members'; end if;
  for v_member in select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) loop
    if not private.is_community_member(v_member) or not private.shares_community_group(v_user, v_member) then
      raise exception 'Participant is not an eligible community member';
    end if;
    insert into public.conversation_members(conversation_id, user_id, role)
      values (p_conversation_id, v_member, 'member') on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.pin_message(p_message_id uuid, p_pinned boolean)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_conversation uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select conversation_id into v_conversation from public.messages where id = p_message_id;
  if v_conversation is null or not private.is_conversation_member(v_conversation) then raise exception 'Message not found'; end if;
  update public.messages set pinned_at = case when p_pinned then now() else null end,
    pinned_by = case when p_pinned then auth.uid() else null end
  where id = p_message_id;
end;
$$;

create or replace function public.publish_story(
  p_story_id uuid,
  p_story_type text,
  p_text_content text,
  p_storage_path text,
  p_audience text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_member uuid;
begin
  if v_user is null or not private.is_community_member(v_user) then raise exception 'Approved community membership required'; end if;
  if p_story_type not in ('text', 'image') or p_audience not in ('community', 'selected-members') then raise exception 'Invalid story options'; end if;
  if p_story_type = 'text' and char_length(trim(coalesce(p_text_content, ''))) not between 1 and 500 then raise exception 'Story text must be 1-500 characters'; end if;
  if p_story_type = 'image' and (p_storage_path is null or p_storage_path not like 'stories/' || v_user::text || '/' || p_story_id::text || '/%') then raise exception 'Invalid story media path'; end if;
  if p_audience = 'selected-members' and coalesce(array_length(p_member_ids, 1), 0) = 0 then raise exception 'Choose at least one audience member'; end if;
  insert into public.stories(id, owner_id, story_type, text_content, storage_path, audience, status, expires_at)
    values (p_story_id, v_user, p_story_type, coalesce(p_text_content, ''), p_storage_path, p_audience, 'published', now() + interval '24 hours');
  if p_audience = 'selected-members' then
    for v_member in select distinct unnest(coalesce(p_member_ids, '{}'::uuid[])) loop
      if v_member <> v_user then
        if not private.is_community_member(v_member) or not private.shares_community_group(v_user, v_member) then raise exception 'Story audience contains an ineligible member'; end if;
        insert into public.story_audience_members(story_id, user_id) values (p_story_id, v_member) on conflict do nothing;
      end if;
    end loop;
  end if;
  return p_story_id;
end;
$$;

create or replace function public.mark_story_view(p_story_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null or not private.can_view_story(p_story_id) then raise exception 'Story not found'; end if;
  insert into public.story_views(story_id, viewer_id) values (p_story_id, auth.uid())
    on conflict (story_id, viewer_id) do update set viewed_at = excluded.viewed_at;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public;
revoke all on function public.create_group_conversation(text, uuid[]) from public;
revoke all on function public.add_conversation_members(uuid, uuid[]) from public;
revoke all on function public.pin_message(uuid, boolean) from public;
revoke all on function public.publish_story(uuid, text, text, text, text, uuid[]) from public;
revoke all on function public.mark_story_view(uuid) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.add_conversation_members(uuid, uuid[]) to authenticated;
grant execute on function public.pin_message(uuid, boolean) to authenticated;
grant execute on function public.publish_story(uuid, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.mark_story_view(uuid) to authenticated;

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

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages
  for each row execute function private.on_message_inserted();

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists messages_updated_at on public.messages;
create trigger messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();

-- Private Storage: upload paths are conversations/{conversation}/{uploader}/{file}
-- or stories/{owner}/{story-id}/{file}. A private bucket is never exposed by public URL.
insert into storage.buckets(id, name, public, file_size_limit)
  values ('chat-media', 'chat-media', false, 52428800)
  on conflict (id) do nothing;

drop policy if exists chat_media_select_authorized on storage.objects;
create policy chat_media_select_authorized on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media' and (
      ((storage.foldername(name))[1] = 'conversations'
        and private.is_conversation_member(((storage.foldername(name))[2])::uuid))
      or
      ((storage.foldername(name))[1] = 'stories'
        and private.can_view_story(((storage.foldername(name))[3])::uuid))
    )
  );

drop policy if exists chat_media_insert_owner on storage.objects;
create policy chat_media_insert_owner on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media' and (
      ((storage.foldername(name))[1] = 'conversations'
        and ((storage.foldername(name))[3])::uuid = auth.uid()
        and private.is_conversation_member(((storage.foldername(name))[2])::uuid))
      or
      ((storage.foldername(name))[1] = 'stories'
        and ((storage.foldername(name))[2])::uuid = auth.uid()
        and ((storage.foldername(name))[3])::uuid is not null
        and private.is_community_member(auth.uid()))
    )
  );

drop policy if exists chat_media_update_owner on storage.objects;
create policy chat_media_update_owner on storage.objects
  for update to authenticated using (
    bucket_id = 'chat-media' and (
      ((storage.foldername(name))[1] = 'conversations'
        and ((storage.foldername(name))[3])::uuid = auth.uid()
        and private.is_conversation_member(((storage.foldername(name))[2])::uuid))
      or
      ((storage.foldername(name))[1] = 'stories'
        and ((storage.foldername(name))[2])::uuid = auth.uid())
    )
  ) with check (bucket_id = 'chat-media');

drop policy if exists chat_media_delete_owner on storage.objects;
create policy chat_media_delete_owner on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-media' and (
      ((storage.foldername(name))[1] = 'conversations'
        and ((storage.foldername(name))[3])::uuid = auth.uid()
        and private.is_conversation_member(((storage.foldername(name))[2])::uuid))
      or
      ((storage.foldername(name))[1] = 'stories'
        and ((storage.foldername(name))[2])::uuid = auth.uid())
    )
  );

-- Enable Postgres Changes for durable chat and notification data. Presence and typing
-- remain ephemeral Realtime channels and are not persisted as database rows.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'conversations','conversation_members','messages','message_attachments',
      'message_reactions','message_receipts','stories','story_views',
      'story_reactions','in_app_notifications'
    ] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;
