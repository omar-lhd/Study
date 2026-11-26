-- Record the explicitly approved initial code-admin bootstrap without storing credentials.
insert into public.code_audit_logs(actor_id,action,metadata)
select 'dadf0268-9596-4b5f-b8a0-e38368b7496e'::uuid,'admin_added',
       jsonb_build_object('target_user_id','dadf0268-9596-4b5f-b8a0-e38368b7496e','bootstrap',true)
where not exists (
  select 1 from public.code_audit_logs
  where action='admin_added'
    and metadata->>'bootstrap'='true'
    and metadata->>'target_user_id'='dadf0268-9596-4b5f-b8a0-e38368b7496e'
);
