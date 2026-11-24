-- Private member and group avatars live in the existing private chat-media bucket.
-- Only approved community members can upload/read avatars; each owner can delete
-- objects under their own avatar namespace. Restrict metadata to raster images
-- and enforce the 10 MiB avatar limit at the Storage RLS boundary.

drop policy if exists chat_media_avatar_insert_owner on storage.objects;
create policy chat_media_avatar_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = 'avatars'
  and ((storage.foldername(name))[2])::uuid = (select auth.uid())
  and private.is_community_member((select auth.uid()))
  and coalesce(metadata ->> 'mimetype', '') in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
  )
  and case
    when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$'
      then (metadata ->> 'size')::bigint <= 10485760
    else false
  end
);

drop policy if exists chat_media_avatar_select_community on storage.objects;
create policy chat_media_avatar_select_community
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = 'avatars'
  and private.is_community_member((select auth.uid()))
);

drop policy if exists chat_media_avatar_delete_owner on storage.objects;
create policy chat_media_avatar_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = 'avatars'
  and ((storage.foldername(name))[2])::uuid = (select auth.uid())
);
