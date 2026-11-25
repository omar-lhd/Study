# Invitation Code Administration

## Route and access model
- Dashboard route: `/admin/codes` inside the authenticated application shell.
- Backend: Supabase Edge Function `invite-code-admin`, deployed with JWT verification enabled.
- Every request validates the bearer JWT with Supabase Auth and checks the caller's UUID against `public.code_admins`. UI hiding is not an authorization boundary.
- Code-management administrators are separate from `group_members` and do not receive group membership or group-admin permissions by being added as a code admin.
- Adding an administrator requires a real Supabase Auth UUID. The backend verifies the account exists. Revocation is transactional, audit-logged, disallows self-revocation, and protects the last administrator with a table lock.
- Initial administrator bootstrap is a trusted database migration containing the explicitly approved, verified Auth UUID `dadf0268-9596-4b5f-b8a0-e38368b7496e`. It is not exposed through an HTTP endpoint or self-service claim flow. The migration is idempotent for that fixed UUID only.

## Existing invitation system reused
- `public.invite_codes` remains the canonical code table.
- Existing `public.redeem_invite(p_code)` remains the canonical redemption RPC. It normalizes the submitted code, SHA-256 hashes it, locks the matching row, and enforces single-use, expiry, revocation, and membership rules before granting membership.
- Code generation hashes normalized uppercase plaintext as SHA-256 and stores the bytea hash; plaintext is returned only once in the generation response.
- Existing RLS policies and group membership rules are not weakened. Sensitive code tables have no anon/authenticated grants; service-role operations occur only in the Edge Function.

## Added database objects
- `code_admins`: explicit code-dashboard administrator UUIDs.
- `code_batches`: purpose, description, group, configuration, creator, timestamps, and expiry.
- `code_audit_logs`: administrative and redemption events; plaintext is never logged.
- `invite_codes.batch_id`, `code_label`, and `internal_note` metadata columns.
- `admin_create_study_group(name, creator)`: service-role-only transactional group creation. The explicit group creator receives the ordinary owner membership for that newly created group; existing groups/memberships are untouched.
- `admin_add_code_admin` and `admin_revoke_code_admin`: service-role-only audited RPCs; revocation protects the last admin.

## Dashboard features
- Overview metrics, activity, recent audit events and batches.
- Generate one or up to 200 codes, configurable 12–32 character length, optional readable prefix, label, batch name, purpose, note, group and expiration.
- Copy individual codes or all codes, and export generated plaintext to CSV before leaving the one-time result view.
- Search labels/notes; filter codes by status, group, batch and creation date; paginate.
- Batch summaries and revocation of unused codes; individual unused-code revocation; internal note editing.
- Audit log and administrator management by Auth UUID.
- Responsive layout, existing Study component tokens, current app locale direction, and theme.

## Testing and deployment
- Database migration: `supabase/migrations/20261125130000_invitation_code_admin.sql`.
- Edge Function source: `supabase/functions/invite-code-admin/index.ts`.
- Migration was applied to the verified live project `qoujujwecszmwcabevmv`; the fixed initial admin UUID was verified in `code_admins`.
- Edge Function is deployed and JWT verification is enabled.
- Vercel preview branch: `feature/admin-invitation-code-dashboard`; check the branch deployment card and build logs before considering the frontend production-ready.
- Important remaining validation: authenticated browser end-to-end tests for generation/export/redeem/revoke and admin-management, and confirmation of successful Vercel build. No plaintext code has been generated during implementation.
