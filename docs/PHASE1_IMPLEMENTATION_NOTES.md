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
Ten additive migrations are committed on the phase branch and applied:
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

Security hardening narrows client column grants so clients cannot self-promote conversation roles or directly forge message system fields/receipts. Verified after migrations: RLS enabled on all 11 Phase 1 public tables; 10 relevant tables in the Realtime publication; 2 private conversation Realtime policies; Story-reaction notification trigger installed; no anonymous EXECUTE on privileged Phase 1 RPCs. The final RLS fix corrected the reply-message and attachment-conversation predicates. Private avatar Storage policies permit raster avatar uploads (10 MiB max) only under the authenticated owner's avatar namespace and allow reads only to approved community members. The Supabase performance advisor no longer reports unindexed foreign keys or auth RLS init-plan warnings; unused-index notices are expected before live traffic.

## Frontend work now on the phase branch
- App-wide entry authentication now supports separate email OTP login and signup modes. Signup requests `create_user: true`; login requests `create_user: false`. After email verification, users pass the approved community-membership gate, then complete display name/unique username/bio setup. Chats no longer owns a separate login prompt. Global sign-out is available in the app shell.
- Cloud Chats loads RLS-filtered member profiles with private signed avatar URLs, supports profile metadata/avatar editing, direct conversations, group creation with optional group image and member management (add/remove/leave with admin transfer protection), conversation previews and unread badges.
- Persisted text messages support replies, edit/delete, forward, pin/unpin, ❤️/👍 reactions, and delivery/read ticks.
- Private file/image and voice-note upload/playback UI uses Storage uploads and signed URLs.
- Private Realtime conversation channel subscribes to message changes, tracks presence, broadcasts typing and refresh events, reconnects, and refreshes tokens. A 30-second REST refresh is retained as fallback.
- Stories support text/image publishing, community or selected-member audience, 24-hour active listing, viewer dialog, owner-only viewer list, view recording and reactions.
- In-app notification list supports marking read and opening related conversations or Story viewers. Message notifications are created by the existing database trigger; Story reaction notifications are now created by the added trigger.
- Cloud UI and OTP panel include English and Egyptian Arabic translation strings.
- UI/UX refresh on the Phase 1 branch: Study / Night Desk brand tokens (ink-plum, saffron, lilac), an original book-and-orbit mark, updated app icon, Manrope + IBM Plex Sans Arabic, app-entry OTP screens (not a Chats-only sign-in), circular Story rail, conversation-first inbox, real loading skeletons for Stories/member/conversation rows, and mobile full-screen thread/back navigation. Cloud Chats now includes RLS-scoped message search, Story previous/next navigation with seen/unseen rings, and conversation pin/mute controls. Message and Story image uploads validate type/size, expose progress and cancellation; voice recording can be cancelled, previewed before send, and stores duration metadata. Profile/group avatar files use the private `chat-media` bucket and 1-hour signed URLs; the new Storage policies enforce member-only reads, owner-only writes/deletes, raster MIME types and the 10 MiB avatar cap. No real member or conversation data is fabricated.
- Existing local Private Notes and local Story drafts remain preserved for authenticated app users. Existing Sessions code/data was not changed.
- IndexedDB caches conversation/member/story indexes and message history. A durable outbox stores offline text and attachment messages, uses stable client-generated message UUIDs to make retries idempotent, and syncs from a global app component when connectivity returns. Offline cache/outbox behavior has not yet been device-tested.

## Verification
- GitHub Actions CI run #155 passed `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` for the app-wide auth and offline-outbox implementation before the final small lint/documentation adjustment; the latest head still needs a fresh green run.
- Earlier CI runs caught and corrected type/lint/source issues; those failures are not being represented as successful runs.
- Database verification confirmed RLS and the Realtime/Story notification additions.
- Supabase Security Advisor still reports the intentionally exposed authenticated SECURITY DEFINER RPCs (they perform server-side authorization checks), the private `invite_codes` table with no direct policy (invite redemption is RPC-only), and disabled leaked-password protection (the current sign-in path is email OTP). These are documented residuals, not claimed as zero findings.
- No real two-account/device acceptance test has been completed yet.
- OTP email delivery/configuration has not been verified against an approved member inbox. The user screenshot error `Signups not allowed for otp` matches the previous client behavior: the only Chats OTP call explicitly used `create_user: false`, so new addresses could not register. The new app-level signup flow sends `create_user: true`; if Supabase Auth's project-level “Allow new users to sign up” setting is disabled, the hosted project will still reject registration. The current Supabase connector exposes database/project tools but no hosted Auth settings write, so that setting remains to be verified/enabled in the dashboard.
- A fresh Vercel deployment for the current Phase 1 branch is blocked by the Vercel API quota (100 deployments/day; retry window reported as 24 hours). The previous READY deployment at commit `d49ec1760c30c752c1280c1b1fa0ea1fbde069fa` predates the Study / Night Desk UX and avatar work and must not be used for current visual acceptance. GitHub Actions CI #134 passed typecheck, lint, tests and build on the current code.

## Remaining Phase 1 work / acceptance blockers
- Confirm Notion handoff archive and original Master Project Record/Execution Plan review; they were not readable through the available connector in this execution context.
- Inspect the actual Figma file and complete visual QA; no Figma file key/link was available through the connected tools.
- Complete real approved-account OTP and membership tests, including two separate accounts/devices and private membership boundaries. Current database snapshot: 2 Auth users, 2 profiles, 1 group membership, 0 conversations; no synthetic member/message data was inserted.
- Activation-code page is a disabled placeholder; generator/redemption remains deferred as explicitly requested. Until it exists, only the existing server-side approved membership record grants app access.
- Implement and test actual end-to-end encryption (E2EE), including key generation, per-user/device key distribution, secure multi-device/recovery behavior, encrypted payloads and authorization tests. Current chats are private via RLS and encrypted in transit/at rest by the platform, but message payloads are not E2EE.
- Test Realtime WebSocket join, presence, typing, reconnect and fallback against the live project; CI validates compilation/build, not live service behavior.
- Verify storage upload, signed downloads, upload cancellation/progress, and voice recording on supported browsers/devices.
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
