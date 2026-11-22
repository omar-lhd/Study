# Private Study Community (working name)

A private social learning and collaboration platform for a small group of friends: personal academic organization, chats, live study sessions, profiles, XP and friendly competition, stories, homework help, notifications and prayer-aware sessions.

The product name is a working name. Final branding is undecided.

## Documents

- [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md): the complete product vision and agreed rules (kept separate from status).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, routes, design system, localization and theme strategy, environment variables.
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md): what exists, what is planned, Package A scope, limitations and open questions.

## Commands

```bash
pnpm dev         # development server
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # production build
pnpm check       # typecheck + lint + build
```

Copy `.env.example` to `.env.local` when backend integration begins (Package B). Never commit real values.
