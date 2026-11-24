-- Group membership removal/leave operation. Admins may remove members;
-- any member may leave. If the last admin/owner leaves, promote the oldest
-- remaining member so the group retains an administrator.

create or replace function public.remove_conversation_member(
  p_conversation_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_kind text;
  v_target_role text;
  v_other_admin uuid;
  v_next_member uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select kind into v_kind from public.conversations where id = p_conversation_id;
  if v_kind is distinct from 'group' then raise exception 'Only group conversations support member removal'; end if;

  if p_member_id <> v_user and not private.is_conversation_admin(p_conversation_id) then
    raise exception 'Group admin permission required';
  end if;

  select role into v_target_role
  from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_member_id;

  if v_target_role is null then raise exception 'Conversation member not found'; end if;

  if v_target_role in ('owner', 'admin') then
    select user_id into v_other_admin
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id <> p_member_id
      and role in ('owner', 'admin')
    order by case role when 'owner' then 0 else 1 end, joined_at
    limit 1;

    if v_other_admin is null then
      select user_id into v_next_member
      from public.conversation_members
      where conversation_id = p_conversation_id and user_id <> p_member_id
      order by joined_at
      limit 1;

      if v_next_member is null then
        raise exception 'A group must have another member before its last admin can leave';
      end if;

      update public.conversation_members
      set role = 'admin'
      where conversation_id = p_conversation_id and user_id = v_next_member;
    end if;
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_member_id;
end;
$$;

revoke all on function public.remove_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.remove_conversation_member(uuid, uuid) to authenticated;
