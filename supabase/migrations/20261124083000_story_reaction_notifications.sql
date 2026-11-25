-- Notify the Story owner when another eligible member reacts.
-- Additive: existing notifications and reactions are preserved.

create or replace function private.notify_story_reaction_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid;
  v_expires_at timestamptz;
begin
  select owner_id, expires_at
    into v_owner_id, v_expires_at
    from public.stories
    where id = new.story_id;

  if v_owner_id is null
     or v_owner_id = new.user_id
     or v_expires_at <= now() then
    return new;
  end if;

  insert into public.in_app_notifications (
    recipient_id, actor_id, notification_type, payload
  ) values (
    v_owner_id,
    new.user_id,
    'story_reaction',
    jsonb_build_object('story_id', new.story_id, 'emoji', new.emoji)
  );

  return new;
end;
$$;

revoke all on function private.notify_story_reaction_owner() from public, anon, authenticated;

drop trigger if exists story_reactions_notify_owner on public.story_reactions;
create trigger story_reactions_notify_owner
after insert on public.story_reactions
for each row
execute function private.notify_story_reaction_owner();
