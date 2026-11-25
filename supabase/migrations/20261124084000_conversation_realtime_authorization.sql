-- Private Realtime authorization for conversation channels.
-- Channel topic format: conversation:<conversation UUID>.
-- Only conversation members may join, broadcast, or track presence.

drop policy if exists conversation_members_realtime_read on realtime.messages;
create policy conversation_members_realtime_read
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and case
    when (select realtime.topic()) ~ '^conversation:[0-9a-fA-F-]{36}$'
    then (select private.is_conversation_member(split_part((select realtime.topic()), ':', 2)::uuid))
    else false
  end
);

drop policy if exists conversation_members_realtime_write on realtime.messages;
create policy conversation_members_realtime_write
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and case
    when (select realtime.topic()) ~ '^conversation:[0-9a-fA-F-]{36}$'
    then (select private.is_conversation_member(split_part((select realtime.topic()), ':', 2)::uuid))
    else false
  end
);
