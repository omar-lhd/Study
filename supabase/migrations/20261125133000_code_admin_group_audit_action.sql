-- Add the explicit group-created audit event used by the admin group creation RPC.
alter table public.code_audit_logs drop constraint if exists code_audit_logs_action_check;
alter table public.code_audit_logs add constraint code_audit_logs_action_check
  check (action in ('admin_access','batch_generated','code_generated','code_revoked','batch_revoked','code_note_updated','code_redeemed','admin_added','admin_revoked','group_created'));
