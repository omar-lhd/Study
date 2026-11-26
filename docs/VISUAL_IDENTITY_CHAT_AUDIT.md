# Study Visual Identity + Chat Redesign — Audit & Implementation Notes

## Context
Primary visual reference: approved Study dark/light identity (midnight navy, layered indigo/violet and blue ambient light, restrained premium glass, strong hierarchy). Light mode is separately art-directed and luminous, not a simple inversion. Chat layout reference informs information architecture only; do not copy Messenger/WhatsApp/TikTok. Generated Study Chat Hub and full conversation references are visual direction, not literal UI text.

## Audit (2026-11-26)
- Canonical repository: omar-lhd/Study. Default branch: main. Current main HEAD: fe2bb2d64efc46ca3a03f4f1869c14b2318b18ef (commit: 'Remove misplaced preview-only email confirmation page').
- Created feature branch: feature/study-visual-chat-redesign.
- Stack: Next.js App Router, React 19, strict TS, Tailwind v4, pnpm; Arabic/English i18n, RTL/LTR, cookie-persisted dark/light themes.
- UI shell: responsive mobile topbar + bottom nav; tablet icon rail; desktop sidebar. Feature modules and UI primitives exist.
- Existing Chat route uses features/chats/chats-experience.tsx. Current UI is local private-notes and local Story drafts only using localStorage (lib/chats/local-repository.ts). Community directory and real conversations are explicitly unavailable; lib/chats/service.ts is an unavailable adapter. No real inbox rows, stories feed, group conversations or cloud messages in current app UI.
- Chat screen uses a two-panel shell on md+; mobile full-height notes panel but the core experience is a local notes surface. Message UI supports local text, reply and two reactions. Image/file/voice controls are disabled. Search is largely private notes / placeholder; members empty state.
- lib/chats/types.ts already defines ConversationSummary, CommunityMember, ChatMessage, CommunityStory, StoryDraft, ChatServices interface.
- Docs (docs/ARCHITECTURE.md, docs/IMPLEMENTATION_STATUS.md, docs/PRODUCT_VISION.md) accurately say app shell foundation implemented; social/chat/stories are planned. Architecture says Supabase integration not in lib/supabase/ yet, so do not claim frontend DB integration.
- Supabase project verified by live project list: private-study-community ref qoujujwecszmwcabevmv, ACTIVE_HEALTHY, eu-central-1. Do not use any other project.
- Database schema contains profiles, study_groups, group_members, conversations, conversation_members, messages, message_attachments, message_reactions, message_receipts, stories, story_views, story_reactions and invitation-code administration tables. RLS enabled across main tables. Migrations include identity/chats/stories foundation, message receipts/operations, security hardening, realtime authorization, story notifications, policy tuning, membership management, avatar storage and admin code work.
- RLS policies audited: conversations/messages are member-scoped; message inserts require sender auth + membership; profile select is self or shared-group; stories select via private.can_view_story; views and reactions constrained to permitted audience. UI must respect these and never leak administrative code or backend details.
- Supabase edge functions found active: instant-password-signup (verify_jwt false), invite-code-admin (verify_jwt true). Their behavior was NOT audited.
- Security Advisor (2026-11-26) flagged (1) five invite admin tables RLS enabled but no policies (likely deliberate backend-only access but verify function access path), (2) 14 SECURITY DEFINER RPCs executable by authenticated users, including chat/story operations—review least privilege, (3) leaked-password protection disabled. These are audit flags, not automatically defects; do not change database in a visual redesign.
- No app code or DB writes made during audit. No tests run. Notion handoff URL could not be read through GitHub tool; consult separately if connector exists.
- Project status doc is stale relative to DB provisioning: it says no Supabase implementation / chats planned; live Supabase already has migrations/tables. Need update only after confirming implementation changes.

## Design system direction
- Ambient canvas: midnight/navy with restrained multi-hue aurora fields; deep atmospheric background with low-contrast glow.
- Semantic palette: ink navy, midnight blue, indigo, violet, cyan glint, cool pearl surfaces; avoid single-color purple everywhere.
- Material tiers: ambient background; subtle translucent surfaces; standard glass cards; elevated floating surfaces; modal overlays. Blur selective, gradient edge/inner highlight, shadow and saturation controls.
- Light mode: pearl/lavender-blue atmosphere, translucent cool surfaces, deep ink typography and selective violet/blue accents.
- Keep existing tokens semantic; central CSS variables and reusable glass classes; keep focus/reduced-motion/contrast.
- Chat Hub: header search/new chat; story rail with Add Story; optional activity panel only if backed by existing data; conversation list; floating action and existing bottom navigation.
- Full conversation: mobile full-screen, tablet/desktop responsive complete conversation (split pane only when appropriate); header, ambient background, incoming/outgoing bubbles, message metadata, composer adaptive to keyboard and safe areas. Don't pretend send/voice/calls etc work unless connected.
- Stories: integration UI only when real stories services are wired; existing local drafts must remain accurately labeled as local/drafts.
- Preserve local notes and current sessions feature unchanged. No schema changes, backend rewrites, auth changes or service-role exposure.

## Scope / safety
Implement the design system and safe visual refinements now; do not invent mock conversations, fabricated presence, unread counts, fake story data or nonfunctional call/attachment controls. Until ChatServices are actually connected, keep an explicit, friendly empty state explaining the member directory and chat feed are not connected, while styling the existing local-notes path as a private local utility. Future provider integration must use the existing ChatServices interface and Supabase RLS, with server authorization.
