# Phase 1 Implementation Notes (in progress)

Status: **connected frontend and backend foundations are on the phase branch; end-to-end Phase 1 is not yet accepted.**

## Verified environment
- GitHub repository: `omar-lhd/Study`
- Base branch preserved: `main`
- Working branch: `phase-1/identity-chats-stories`
- Draft PR: #2
- Supabase project: `private-study-community` (`qoujujwecszmwcabevmv`)
- Supabase database: PostgreSQL 17
- Existing public application tables before Phase 1: `profiles`, `study_groups`, `group_members`, `invite_codes`
- Existing profile bootstrap trigger is idempotent (`ON CONFLICT DO NOTHING`).
- Existing group/invite structures were preserved.
- At inspection, two Auth accounts existed but only one `group_members` membership row existed. Cross-account tests require legitimate membership for the second test account; no membership bypass was added.

## Database work applied to the verified Supabase project
Nine additive migrations are committed on the phase branch and applied:
1. `20261124073800_phase1_identity_chats_stories.sql`
2. `20261124080000_phase1_message_receipts_and_operations.sql`
3. `20261124081000_phase1_security_hardening.sql`
4. `20261124082000_phase1_revoke_anon_rpc.sql`
5. `20261124083000_story_reaction_notifications.sql`
6. `20261124084000_conversation_realtime_authorization.sql`
7. `20261124085000_phase1_security_and_fk_indexes.sql`
8. `20261124090000_conversation_member_removal.sql`
9. `20261124091000_fix_chat_rls_and_policy_performance.sql`

They provide profile metadata, direct/group conversations and memberships, messages, attachments, reactions, delivery/read receipts, Stories and audience/view/reaction records, in-app notifications, private `chat-media` Storage policies, Realtime publication membership, member-authorized private Realtime channel policies, and guarded RPCs for conversation/group creation and member removal/leave, Story publishing/views, message read/edit/delete/pin.

Security hardening narrows client column grants so clients cannot self-promote conversation roles or directly forge message system fields/receipts. Verified after migrations: RLS enabled on all 11 Phase 1 public tables; 10 relevant tables in the Realtime publication; 2 private conversation Realtime policies; Story-reaction notification trigger installed; no anonymous EXECUTE on privileged Phase 1 RPCs. The final RLS fix corrected the reply-message and attachment-conversation predicates. The Supabase performance advisor no longer reports unindexed foreign keys or auth RLS init-plan warnings; unused-index notices are expected before live traffic.

## Frontend work now on the phase branch
- Chats route includes email OTP sign-in for existing Auth accounts, session refresh, sign-out, and membership-gated cloud data.
- Cloud Chats loads RLS-filtered member profiles, supports profile metadata editing, direct conversations, group creation and member management (add/remove/leave with admin transfer protection), conversation previews and unread badges.
- Persisted text messages support replies, edit/delete, forward, pin/unpin, ❤️/👍 reactions, and delivery/read ticks.
- Private file/image and voice-note upload/playback UI uses Storage uploads and signed URLs.
- Private Realtime conversation channel subscribes to message changes, tracks presence, broadcasts typing and refresh events, reconnects, and refreshes tokens. A 30-second REST refresh is retained as fallback.
- Stories support text/image publishing, community or selected-member audience, 24-hour active listing, viewer dialog, owner-only viewer list, view recording and reactions.
- In-app notification list supports marking read and opening related conversations or Story viewers. Message notifications are created by the existing database trigger; Story reaction notifications are now created by the added trigger.
- Cloud UI and OTP panel include English and Egyptian Arabic translation strings.
- UI/UX refresh on the Phase 1 branch: Study / Night Desk brand tokens (ink-plum, saffron, lilac), an original book-and-orbit mark, updated app icon, Manrope + IBM Plex Sans Arabic, compact OTP dialog, branded signed-out welcome instead of default local Notes, circular Story rail, conversation-first inbox and mobile full-screen thread/back navigation. Cloud Chats now includes RLS-scoped message search, Story previous/next navigation with seen/unseen rings, and conversation pin/mute controls. No real member or conversation data is fabricated.
- Existing local Private Notes and local Story drafts remain available while signed out. Existing Sessions code/data was not changed.

## Verification
- GitHub Actions CI run #79 passed `pnpm typecheck`, `pnpm lint`, and `pnpm build` on the phase branch after the RLS policy corrections.
- Earlier CI runs caught and corrected type/lint/source issues; those failures are not being represented as successful runs.
- Database verification confirmed RLS and the Realtime/Story notification additions.
- Supabase Security Advisor still reports the intentionally exposed authenticated SECURITY DEFINER RPCs (they perform server-side authorization checks), the private `invite_codes` table with no direct policy (invite redemption is RPC-only), and disabled leaked-password protection (the current sign-in path is email OTP). These are documented residuals, not claimed as zero findings.
- No real two-account/device acceptance test has been completed yet.
- OTP email delivery/configuration has not been verified against an approved member inbox.
- Vercel preview is now available for the connected `study` project on the Phase 1 branch. Latest verified deployment at review time: `https://study-5wvfbfcjg-omar-947f.vercel.app` (branch alias: `https://study-git-phase-1-identity-chats-stories-omar-947f.vercel.app`), commit `d49ec1760c30c752c1280c1b1fa0ea1fbde069fa`, state `READY`. GitHub Actions CI run #81 passed. Vercel SSO protection is enabled for preview deployments; testers may need to sign in to the connected team. Environment variable names/configuration are present for the preview target; secret values were not read or logged. This confirms deployment/build only, not live authentication or end-to-end messaging.

## Remaining Phase 1 work / acceptance blockers
- Confirm Notion handoff archive and original Master Project Record/Execution Plan review; they were not readable through the available connector in this execution context.
- Inspect the actual Figma file and complete visual QA; no Figma file key/link was available through the connected tools.
- Complete real approved-account OTP and membership tests, including two separate accounts/devices and private membership boundaries.
- Test Realtime WebSocket join, presence, typing, reconnect and fallback against the live project; CI validates compilation/build, not live service behavior.
- Verify storage upload, signed downloads and voice recording on supported browsers/devices.
- Verify all message/story/notification RLS cases and end-to-end notification navigation.
- Re-run typecheck, lint, tests and build on the latest UI commit after the Vercel/GitHub build limit clears.
- Review accessibility, responsive layout, Arabic RTL and English LTR visually; current CI is not visual acceptance.
- Keep the draft PR unmerged until these live acceptance checks pass.

## Required next actions
1. Use the Phase 1 preview deployment and complete live account/device acceptance tests.
2. Confirm approved membership for the second test account through the existing community process.
3. Run the two-account acceptance suite and fix any live auth, RLS, Storage or Realtime issues.
4. Complete Notion/Figma review and final visual/accessibility QA.
5. Keep Phase 1 in draft until acceptance criteria pass.
