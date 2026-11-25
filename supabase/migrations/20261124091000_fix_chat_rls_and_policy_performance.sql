-- Correct two correlated policy predicates that were accidentally self-comparisons.
-- Reply visibility is checked through the member-scoped helper; the composite FK
-- already enforces that a reply belongs to the same conversation.
drop policy if exists messages_insert_sender_member on public.messages;
create policy messages_insert_sender_member
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and private.is_conversation_member(conversation_id)
  and (reply_to_message_id is null or private.can_access_message(reply_to_message_id))
  and (forwarded_from_message_id is null or private.can_access_message(forwarded_from_message_id))
);

drop policy if exists message_attachments_insert_sender on public.message_attachments;
create policy message_attachments_insert_sender
on public.message_attachments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
      and m.conversation_id = message_attachments.conversation_id
      and m.sender_id = (select auth.uid())
  )
);

-- Cover existing foreign keys identified by the Supabase performance advisor.
create index if not exists invite_codes_created_by_idx on public.invite_codes(created_by);
create index if not exists invite_codes_used_by_idx on public.invite_codes(used_by);
create index if not exists study_groups_created_by_idx on public.study_groups(created_by);

-- Cache stable Auth identity lookups per statement in RLS policies. The
-- authorization semantics are unchanged; this is the documented initPlan form.
do $$
declare
  pol record;
  v_qual text;
  v_check text;
  v_roles text;
  v_stmt text;
begin
  for pol in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
        or coalesce(qual, '') like '%auth.role()%'
        or coalesce(with_check, '') like '%auth.role()%'
      )
  loop
    v_qual := pol.qual;
    v_check := pol.with_check;
    if v_qual is not null then
      v_qual := replace(v_qual, 'auth.uid()', '(select auth.uid())');
      v_qual := replace(v_qual, 'auth.role()', '(select auth.role())');
    end if;
    if v_check is not null then
      v_check := replace(v_check, 'auth.uid()', '(select auth.uid())');
      v_check := replace(v_check, 'auth.role()', '(select auth.role())');
    end if;

    select string_agg(case when role_name = 'public' then 'PUBLIC' else quote_ident(role_name) end, ', ')
      into v_roles
      from unnest(pol.roles) as role_name;

    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    v_stmt := format('create policy %I on %I.%I as %s for %s to %s',
      pol.policyname, pol.schemaname, pol.tablename, pol.permissive, pol.cmd, v_roles);
    if v_qual is not null then v_stmt := v_stmt || format(' using (%s)', v_qual); end if;
    if v_check is not null then v_stmt := v_stmt || format(' with check (%s)', v_check); end if;
    execute v_stmt;
  end loop;
end;
$$;
