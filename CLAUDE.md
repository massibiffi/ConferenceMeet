# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ConferenceMeet: an Expo (React Native) + Supabase app that helps conference attendees find and
connect with people who share their interests. Core loop: sign in → build a profile (interests +
intent) → join an event → get interest-based matches → swipe to connect → chat (Stream). Full
feature status and design rationale live in `README.md` — read it before making non-trivial changes,
especially the **Connections model** and **Stream Chat** sections.

## Commands

```bash
nvm use                 # MUST be Node 20 — newer Node enables TS type-stripping, which breaks
                         # Expo config-plugin resolution (expo-sharing, expo-modules-core, etc.)
npm install
npm start               # expo start (Expo Go works for non-chat parts)
npx expo start --dev-client   # required for chat (stream-chat-expo has native modules, no Expo Go)

npm test                # run unit tests (Jest + ts-jest)
npm run test:watch
npx jest __tests__/geohash.test.ts   # run a single test file
```

Unit tests only cover the dependency-free `lib/` modules (`geohash.ts`, `sponsors.ts`, `lang.ts`) —
these are deliberately written with no React Native/Expo imports so they run under plain `ts-jest`.
Most real logic lives in Postgres (RLS, matching, verification triggers), tested separately with
pgTAP:

```bash
supabase test db                  # needs supabase/schema.sql copied into supabase/migrations/
./supabase/tests/local/run.sh     # standalone via Docker, no Supabase CLI needed
```

Android builds (EAS): `eas build --platform android --profile preview` (installable `.apk`) or
`--profile production` (`.aab`, Play Store only). Never commit `android/`/`ios/` — this project
stays on Expo's managed/CNG workflow; `app.json` is the single source of truth and EAS regenerates
those folders per build. Always commit `package-lock.json` before `eas build` — it runs `npm ci`
remotely and fails on any lockfile drift.

## Architecture

**Client is a thin UI over Supabase.** Business rules (matching, access control, verification) live
in `supabase/schema.sql` as RLS policies, the `suggested_matches()` function, and triggers — not in
the app. When changing behavior around matching, visibility, or badges, check the schema first.

**Connections are swipe-only and one-sided by design** (not mutual-match): swipe left →
`connections` row with `status = 'accepted'` immediately; swipe right → `status = 'passed'`. There
is no pending/request state and no "Connect" button anywhere. Chat is gated on
`status === 'accepted'`, enforced both in the UI (`app/person/[id].tsx` only shows **Message** once
accepted) and server-side (the `open-channel` Edge Function independently re-checks `connections`,
shared-event membership, and bans).

**Stream chat integration avoids the `stream-chat` SDK inside Edge Functions.** Deno can't resolve
that SDK's native deps (`ws`'s `bufferutil`/`utf-8-validate`), so `supabase/functions/stream-token`
and `supabase/functions/open-channel` sign Stream JWTs by hand with Web Crypto and call Stream's
REST API via `fetch()`. Channel ids are a SHA-256 hash of sorted member ids (not Stream's built-in
distinct-channel id). Client-side, `lib/stream.ts` only *opens* channels returned by `open-channel`;
it never creates them. `stream-chat` must stay pinned to the exact version `stream-chat-expo`
requires internally (check with `npm ls stream-chat` — must show a single deduped entry) — a
mismatch creates two different `StreamChat` classes in `node_modules` and crashes at runtime. Stay
on `stream-chat-expo`'s 8.x line; 9.x requires New Architecture and renames key components.

**Privacy/visibility is enforced in Postgres, not the UI.** Per-contact "hide me" / "hide location"
toggles are backed by `is_hidden_from()` / `is_location_hidden_from()` `SECURITY DEFINER` functions
that feed the RLS policies on `users`, `suggested_matches`, and `user_locations` — a client can't
bypass this by skipping a UI check.

**Verification badges are tamper-proof by trigger**, not by client trust: users can't set their own
`verification_level` / `is_staff` / `is_banned` directly; the `mark_linkedin_verified` `SECURITY
DEFINER` RPC is the only client path to raise a badge, and only upward (never downgrades a stronger
`org_domain`/`manual` level to `linkedin`).

**Routing** uses `expo-router` (file-based, under `app/`). `app/_layout.tsx` is the auth-gated root.
`(tabs)/` holds the three main tabs (discover/directory/profile); `person/[id].tsx` and
`chat/[peerId].tsx` are pushed screens outside the tab bar.

**i18n**: `locales/en.json` is the source of truth; `fr`/`es`/`ar` must mirror its keys exactly.
Registration (resources, RTL flag) happens in `lib/i18n.ts`. Interest tags and event names are
user-entered data, not localized strings — don't try to translate them via i18next.

**`moderation/`** is a separate, standalone, build-free static HTML app (no bundler) for NGO staff —
it talks to Supabase directly with the anon key and relies entirely on RLS (`is_staff` checks) for
access control, not a service-role key.

**Path alias**: `@/*` maps to the repo root (see `tsconfig.json` / `jest.config.js`) — e.g.
`@/lib/supabase`.
