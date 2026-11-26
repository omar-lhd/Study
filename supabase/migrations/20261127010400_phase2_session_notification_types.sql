-- Allow Phase 2 study-session notifications while preserving Phase 1 types.
alter table public.in_app_notifications
  drop constraint if exists in_app_notifications_notification_type_check;

alter table public.in_app_notifications
  add constraint in_app_notifications_notification_type_check
  check (
    notification_type = any (
      array[
        'private_message',
        'group_message',
        'group_member_added',
        'story_reaction',
        'study_session_started',
        'study_session_created',
        'study_session_invitation'
      ]::text[]
    )
  );
