# Implementation Status

## Package A (foundation, shell, design system) - implemented

- Next.js App Router project, strict TypeScript, Tailwind v4, ESLint, GitHub Actions CI (typecheck, lint, build).
- App Shell with responsive navigation (bottom bar / rail / sidebar).
- Route shells for every major area (see ARCHITECTURE.md). Each is an honest placeholder or empty state.
- Design system primitives: Button, IconButton, Input, Textarea, Select, Tabs, Card/Panel, Badge, StatusDot, Avatar, Dialog, EmptyState, ErrorState, LoadingState/Skeleton, PageHeader, SectionHeader, Toaster (sonner).
- Arabic/English with RTL/LTR, cookie persistence, working language switch.
- Dark default and complete Light theme, working theme switch.
- `.env.example`, manifest, app icon.

Working settings: Language and Appearance only. Every other control or section is labelled as coming later.

## Phase 1 — Identity, Chats and Stories (in progress on `phase-1/identity-chats-stories`)

A connected implementation is available on the Phase 1 branch and Draft PR #2. The current UI pass establishes the Study / Night Desk visual direction (ink-plum, saffron, lilac), an original open-book/orbit mark, Manrope + IBM Plex Sans Arabic typography, and a compact sign-in dialog. Authentication is now app-wide rather than a Chats-only prompt: email OTP login/signup, verified session persistence, private membership gate, and required display-name/username profile setup. Chats no longer presents a separate login form. The cloud inbox also has message search scoped by RLS, Story previous/next navigation and seen/unseen rings, conversation pin/mute controls, and loading skeletons for the Story rail/member list/conversation rows. Uploads validate type/size, show progress, support cancellation, and voice notes have cancel, preview and duration metadata. Profile and group avatars use private member-only Storage paths and 1-hour signed URLs; message/Story media links are also limited to 1 hour and refreshed by the periodic data refresh. Signed-out Chats now presents an honest branded welcome rather than the old local Notes experience; the cloud inbox prioritizes conversations, renders Stories as a circular rail, and opens selected threads full-screen on mobile. It includes app-wide Supabase Email OTP login/signup/session handling, profile metadata and membership-gated member discovery, direct/group conversations, persistent messages and operations, private attachments/voice notes, Realtime typing/presence/reconnect, Stories with audience/viewers/reactions/expiry, and in-app notifications. IndexedDB now caches conversation indexes and message history and queues offline text/media messages with stable IDs for app-wide reconnect sync. Ten additive migrations were applied to the verified Supabase project, including member/group avatar Storage policies. Security/RLS checks were performed. Existing local Notes/Story drafts and Sessions remain preserved.

Preview deployment: no fresh deployment for the current branch head; Vercel API rejected deployment creation with the 100-deployments/day quota (retry window reported as 24 hours). The previous READY preview at commit `d49ec1760c30c752c1280c1b1fa0ea1fbde069fa` predates the current UX/avatar work and must not be treated as current. GitHub Actions CI #134 passed `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` on the current code, including private profile/group avatars and 1-hour signed media URLs.

Phase 1 is **not accepted yet**: the user-reported OTP failure was traced to the old Chats auth client always sending `create_user: false` (existing-account-only); the new global signup path sends `create_user: true`, but hosted Supabase Auth must also have “Allow new users to sign up” enabled. The current connector cannot change hosted Auth provider settings, so this dashboard configuration remains an external blocker until verified. Activation-code redemption/generator remains deliberately deferred; new accounts stay locked pending approval. Real OTP delivery, approved second-member access, two-account/two-device behavior, live Realtime/Storage, offline retry QA, E2EE, visual responsive/accessibility QA, and Notion/Figma review remain outstanding. Keep PR #2 draft and unmerged until these checks pass.

## Planned (not implemented in Phase 1)

Academic CRUD, study sessions and rooms, XP and achievements, prayer features, calls, homework help, whiteboard, and Capacitor Android build remain future scope. Preserve the full product vision in `PRODUCT_VISION.md`; deferred features are not removed.

## Package A acceptance criteria

Correct branch; existing work preserved; dev server starts; build, typecheck, lint pass; routes render; Arabic and English both work in RTL and LTR; dark default and light complete; responsive at three sizes; tokens only; no secrets; no fake features; docs accurate; nothing pushed to `main`.

## Known limitations and open questions

- Package A's original workspace snapshot was empty and lacked `.git`; the current canonical repository and Phase 1 branch are now verified in GitHub. Historical Package A constraints remain recorded here, but do not describe the current Phase 1 branch.
- Greeting and date use the fixed `Africa/Cairo` zone (`config/app.ts`) until profiles carry a time zone.
- Theme is dark/light only; no "system" option yet.
- The Study / Night Desk brand direction and matching SVG mark are implemented on the Phase 1 branch and await visual review. A fresh preview build is currently blocked by Vercel's deployment API quota (100 deployments/day; retry window reported as 24 hours). The previous READY deployment predates these UI changes. An intermediate build surfaced duplicate locale keys, unsupported Button sizes, a JSX expression closure, and a lint effect/dependency issue; these were corrected, and CI #108 now passes typecheck, lint, and build on the corrected code commit.
- The unit/e2e test setup is not configured.


## User-confirmed corrections (2026-11-24)

- Login/registration belongs at the app entry, before Home and all navigation; no separate Chats login. Email verification is followed by private activation approval, then profile setup and app access.
- Chats must reserve a circular Story rail and member-profile/conversation-list layout with real loading skeletons. Only real approved members appear; no fabricated people or conversations.
- Activation-code generator/redemption is not built in this phase yet. Until it exists, the server-side community membership record is the only approval signal; no public or insecure bypass.
- Offline chat uses IndexedDB cache and durable outbox; cross-device data becomes available after cloud sync. E2EE is explicitly still missing and is a Phase 1 acceptance requirement before describing chats as encrypted end-to-end.
