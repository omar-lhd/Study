# Study Premium Chat / Visual Redesign

## Source of truth and branch
- Canonical repository: `omar-lhd/Study`.
- This redesign branch is based on `feature/admin-invitation-code-dashboard`, which contains the existing Phase 1 identity/cloud-chat/story work and the private invitation-code administration feature.
- Keep this work unmerged and keep `main` unchanged until reviewed.
- The user supplied the complete visual and functional brief in the conversation. The linked Notion archive could not be fetched through the available connection during this pass; do not claim it was read.

## Required inbox composition
The approved inbox reference communicates element order, not brand/style:
1. Header: search on the left, centered Inbox title, add/find people on the right.
2. Story rail at the top. In RTL, the current user's profile story tile is at the far right, with a visible + affordance for story creation. Other users' active stories are grouped by owner; seen/unseen rings reflect actual view rows.
3. A compact activity/notification card below stories, populated only from actual in-app notifications.
4. The member directory below: real registered/visible profiles, avatar, display name, username/bio, actual presence when available, tap avatar for profile details, tap row to open/start direct conversation, and camera/story quick action.
5. Existing conversation list remains available with real previews, unread counts, timestamps, pin/mute state.
6. Opening a conversation on mobile must be a full-screen thread; app topbar and bottom navigation are hidden, safe areas respected. Desktop may use a full-height split layout.

## Implemented in this branch
- Replaced the prior saffron/Night Desk tokens with Study midnight navy, indigo/violet and blue/cyan accents; Light Mode uses a separate pearl/lavender atmosphere.
- Added selective material tiers: subtle, standard, elevated and modal glass; ambient gradients/texture; message surfaces; reduced-motion handling.
- Reworked the existing `CloudChatsExperience` (not a mock hub) to use the real Supabase-backed story/member/notification/conversation data already in Phase 1.
- Story rail includes the user's profile/+ story affordance and one ring per story owner.
- Activity card uses real notifications only.
- Member rows show actual profiles and include profile preview, direct-chat and camera/story actions.
- Added profile preview from member row and direct-conversation header.
- Applied Study material styling to the inbox, conversation header, bubbles and composer.
- Added physical right-swipe-to-reply and a localized Seen label on the latest read outgoing message.
- Added mobile full-screen thread mode, including safe-area padding and hiding app top/bottom navigation.

## Existing Phase 1 functionality to preserve
The Phase 1 branch already contains Supabase-backed auth/session, profiles, direct/group conversations, message persistence, replies, edit/delete/forward/pin/reactions, unread and delivery/read receipts, attachments/voice notes, realtime/presence/typing, offline queue, text/image Stories, audience selection, story views/reactions and notifications. Do not replace these with local mock data.

## Explicitly not complete / not to claim
- End-to-end encryption (E2EE) is not implemented. Supabase RLS/member authorization protects access to rows, but it is not E2EE. Do not call the chat end-to-end encrypted until client-side key management, key exchange, encrypted payloads and multi-device recovery are implemented and security-reviewed.
- Expanded Story editor: video story support, local music library/audio trimming, start/end selection, drawing, text layers, @username mentions, story reply-to-DM flow, camera/gallery UX, and owner delete controls still need implementation and backend/schema review.
- Full visual QA from an authenticated account and two-user/two-device tests remain required. A public preview request without an app session only renders the auth/loading gate, so it is not proof of inbox visuals or messaging behavior.

## Verification record
- Latest CI at commit `52decbca0254b407a33ce76444b31546d58b10b4`: typecheck, lint, unit tests and production build passed.
- Vercel preview for that commit reached READY. The `/chats` HTML fetch returned the signed-out app loading/auth gate; authenticated visual QA is still pending.
- No Supabase schema or production data changes were made by the visual redesign.
