# Architecture

Stack: Next.js (App Router), React, strict TypeScript, Tailwind CSS v4, pnpm. Runtime dependencies are deliberately few: Radix Dialog and Tabs, class-variance-authority, clsx, tailwind-merge, lucide-react, sonner.

## Folder layout

```
app/                    Routes only. (app)/ group wraps pages in the App Shell.
components/ui/          Design-system primitives (one implementation per component).
components/layout/      App Shell: sidebar/rail, mobile top bar, bottom navigation.
components/shared/      Cross-feature building blocks (section pages, link lists, tabs wrapper).
components/providers/   Client providers (preferences: locale, theme, translator).
config/                 Static configuration: navigation, section definitions, app constants.
features/<area>/        Feature modules: home, chats, study, profile, notifications, settings.
i18n/                   Locale config and message dictionaries (ar, en).
lib/preferences/        Locale and theme cookies: config, server readers, server actions.
lib/utils.ts            Shared utilities (cn).
docs/                   Product and engineering documentation.
```

Reserved for later packages (not created yet): `lib/supabase/` (backend integration), per-feature `services/` and `types/`, and a state layer. Business logic must stay out of `components/`.

## Routes (Package A shells)

`/` Today, `/chats`, `/study`, `/planner` (+ `/planner/{subjects,lessons,tasks,exams,schedule,calendar,goals}`), `/community` (+ `/community/{friends,stories,activity,challenges,help}`), `/profile` (+ `/profile/{identity,academic,xp,achievements,bonds,privacy}`), `/notifications`, `/settings` (+ `/settings/{language,appearance,account,privacy,notifications,sound,devices,focus,groups}`).

Section lists live in `config/sections.ts`; adding a section is a one-line change plus translations.

## Localization

- Arabic (default, Egyptian dialect where natural) and English, flat typed dictionaries in `i18n/messages`. The English dictionary is typed `Record<MessageKey, string>` so a missing key fails typecheck.
- Locale is stored in the `psc-locale` cookie, read on the server in the root layout to set `lang` and `dir` on `<html>`, so there is no flash or hydration mismatch.
- Server components use `getServerTranslator()`; client components use `useT()`.
- Layout uses logical Tailwind utilities (`ps-`, `pe-`, `start-`, `end-`, `border-s`, `text-start`). Directional icons use `rtl:-scale-x-100`. User-entered fields use `dir="auto"` for mixed Arabic/English.
- Persistence is a cookie now; syncing to the user profile is Package B.

## Theme

Dark is default; Light is a separate designed palette. Tokens are CSS variables in `app/globals.css` (`:root` for dark, `.light` for light) exposed to Tailwind through `@theme inline` (e.g. `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`). Components must not use raw colour values. The `psc-theme` cookie is read on the server, so the correct class is rendered in the first HTML.

## Brand direction

The current visual direction is **Study / Night Desk**: an editorial learning identity built around ink-plum surfaces, warm saffron focus, and a restrained lilac idea-accent. It is intentionally not modeled on a short-video or creator-social interface. The mark is an open book with a small orbit/spark, representing focused learning and ideas shared inside a trusted circle. Keep the palette in semantic CSS tokens and maintain a complete warm-paper light theme. This is the implementation direction for review, not a claim of final brand approval.

Chats should feel like a calm study inbox: compact page header, circular story rail, conversation-first list, and a full-screen thread on narrow screens. Member discovery is a deliberate secondary action; do not make the directory or a large sign-in form dominate the first screen. Signed-out users see an honest community welcome and an unobtrusive sign-in dialog, never local notes presented as live chats.

## Typography

Manrope (Latin) and IBM Plex Sans Arabic, both through `next/font` with `display: swap`. The primary family switches by `html[lang]`, with each as fallback for the other script. Manrope supplies a more human, contemporary display rhythm while IBM Plex Sans Arabic preserves readable Arabic shaping.

## Responsive shell

- Mobile (< 768px): sticky top bar (brand, notifications, profile, settings) and a bottom bar with the five main areas; safe-area aware.
- Tablet (768px+): icon rail.
- Desktop (1024px+): full sidebar with labels. Content is capped at `max-w-6xl`; chats use a two-panel layout.

## Environment variables

Names only, see `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No service-role key may ever be exposed to browser code.

## Android / PWA readiness

`app/manifest.ts` and `app/icon.svg` exist. No Capacitor or native pipeline has been added; APK support is NOT claimed. Browser-only APIs must stay behind interfaces when platform features arrive.
