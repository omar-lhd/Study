-- Secure invitation-code admin foundation.
-- Initial administrator is pinned to the verified Supabase Auth UUID by a trusted
-- migration (never by a public endpoint, email lookup, or self-service claim).
-- This migration does not alter existing group membership or redeem_invite().
create table if not exists public.code_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.code_admins enable row level security;
revoke all on public.code_admins from anon, authenticated;
grant select, insert, update, delete on public.code_admins to service_role;

create table if not exists public.code_batches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  purpose text not null default '' check (char_length(purpose) <= 120),
  code_length integer not null default 16 check (code_length between 12 and 32),
  prefix text not null default '' check (char_length(prefix) <= 8 and prefix ~ '^[A-Z0-9]*$'),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.code_batches enable row level security;
revoke all on public.code_batches from anon, authenticated;
grant select, insert, update, delete on public.code_batches to service_role;

alter table public.invite_codes
  add column if not exists batch_id uuid references public.code_batches(id) on delete set null,
  add column if not exists code_label text not null default '' check (char_length(code_label) <= 120),
  add column if not exists internal_note text not null default '' check (char_length(internal_note) <= 1000);
create index if not exists invite_codes_batch_id_idx on public.invite_codes(batch_id);
create index if not exists invite_codes_created_at_idx on public.invite_codes(created_at desc);
revoke all on public.invite_codes from anon, authenticated;
grant select, insert, update, delete on public.invite_codes to service_role;

create table if not exists public.code_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('admin_access','batch_generated','code_generated','code_revoked','batch_revoked','code_note_updated','code_redeemed','admin_added','admin_revoked')),
  group_id uuid references public.study_groups(id) on delete set null,
  batch_id uuid references public.code_batches(id) on delete set null,
  invite_code_id uuid references public.invite_codes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.code_audit_logs enable row level security;
revoke all on public.code_audit_logs from anon, authenticated;
grant select, insert, update, delete on public.code_audit_logs to service_role;
create index if not exists code_audit_logs_created_at_idx on public.code_audit_logs(created_at desc);
create index if not exists code_audit_logs_actor_idx on public.code_audit_logs(actor_id, created_at desc);
create index if not exists code_audit_logs_batch_idx on public.code_audit_logs(batch_id, created_at desc);

-- Explicit, immutable UUID bootstrap. This is executed only by a trusted database
-- migration runner. Re-running it cannot assign privileges to another identity.
insert into public.code_admins(user_id, added_by)
values ('dadf0268-9596-4b5f-b8a0-e38368b7496e'::uuid, 'dadf0268-9596-4b5f-b8a0-e38368b7496e'::uuid)
on conflict (user_id) do nothing;

create or replace function public.audit_invite_redemption()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.used_at is null and new.used_at is not null then
    insert into public.code_audit_logs(actor_id, action, group_id, batch_id, invite_code_id, metadata)
    values (new.used_by, 'code_redeemed', new.group_id, new.batch_id, new.id, jsonb_build_object('redeemed_at', new.used_at));
  end if;
  return new;
end;
$$;
revoke all on function public.audit_invite_redemption() from public, anon, authenticated;
drop trigger if exists invite_codes_audit_redemption on public.invite_codes;
create trigger invite_codes_audit_redemption
after update of used_at on public.invite_codes
for each row execute function public.audit_invite_redemption();

-- Group creation is an explicit dashboard action. The creator receives the
-- normal owner membership for that newly created group; code-admin status itself
-- does not grant or mutate membership in any pre-existing group.
create or replace function public.admin_create_study_group(p_name text,p_creator uuid)
returns public.study_groups
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_group public.study_groups%rowtype;
begin
 if p_name is null or char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 80 then
  raise exception 'Group name must be 2 to 80 characters';
 end if;
 if not exists(select 1 from auth.users where id=p_creator) then
  raise exception 'Creator account not found';
 end if;
 insert into public.study_groups(name,created_by) values(trim(p_name),p_creator) returning * into v_group;
 insert into public.group_members(group_id,user_id,role) values(v_group.id,p_creator,'owner');
 insert into public.code_audit_logs(actor_id,action,group_id,metadata) values(p_creator,'group_created',v_group.id,jsonb_build_object('name',v_group.name));
 return v_group;
end; $$;
revoke all on function public.admin_create_study_group(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_create_study_group(text,uuid) to service_role;
