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

## Planned (not implemented)

Authentication and profiles, groups and invites (Supabase integration), messaging, academic CRUD, study sessions and rooms, XP and achievements, notifications and prayer features, calls, stories, homework help, whiteboard, Capacitor Android build. Package letters beyond A and B are not assigned in this repository yet; the UI says "a later package".

## Package A acceptance criteria

Correct branch; existing work preserved; dev server starts; build, typecheck, lint pass; routes render; Arabic and English both work in RTL and LTR; dark default and light complete; responsive at three sizes; tokens only; no secrets; no fake features; docs accurate; nothing pushed to `main`.

## Known limitations and open questions

- The workspace used for Package A was an empty directory with no `.git`, so no pre-existing Supabase SQL, migrations or CI were present to preserve, and branch/commit state could not be verified. Git branching (`feature/foundation`) must be handled in GitHub.
- Greeting and date use the fixed `Africa/Cairo` zone (`config/app.ts`) until profiles carry a time zone.
- Theme is dark/light only; no "system" option yet.
- Brand identity, final logo and PWA icon set are undecided; the current icon is a neutral placeholder.
- The unit/e2e test setup is not configured.
