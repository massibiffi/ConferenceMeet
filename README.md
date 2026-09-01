# ConferenceMeet — v1 draft scaffold

A cross-platform (iOS + Android) app that helps attendees of a large event find and
connect with people who share their interests. This is a **draft scaffold** that
implements the core loop from the MVP plan:

**Sign in → build a profile with interests + intent → join an event → get interest-based
matches → view profiles → connect.** Chat and live location are wired as clearly-marked
stubs/opt-in features.

> Stack: **Expo (React Native) + Supabase (Postgres/Auth/RLS)**. Chat is intended to be
> **Stream** (not built from scratch). See the MVP plan for the reasoning.

---

## What's implemented

| Area | Status |
|---|---|
| Email auth (sign up / sign in / sign out) | ✅ working |
| Profile edit (name, role, org, headline, bio, **intent**, interests) | ✅ working |
| Events + join an event | ✅ working |
| Attendee directory (search + role filter) | ✅ working |
| Interest-based matching ("Suggested for you" + reasons) | ✅ working (Postgres `suggested_matches` RPC) |
| Swipe-to-connect discovery (Tinder-style deck) | ✅ working — swipe left = **connected immediately** (one-sided by design, no mutual confirmation), right = pass; already-swiped candidates excluded from future matches. **This is the only way to connect** — see [Connections model](#connections-model) below. |
| Profile photo upload | ✅ working — Supabase Storage (`avatars` bucket), updates `users.photo_url` |
| Block / report | ✅ working (from the person page) |
| Row-Level Security (only see co-attendees) | ✅ in schema |
| Email-domain auto-verification | ✅ in schema (trigger) |
| Opt-in, coarse, ephemeral location | ✅ working (share/stop; geohash only) |
| **1:1 chat (Stream)** | ✅ working end-to-end (Stream keys set, both Edge Functions deployed and tested) — requires an **accepted connection**, see below |
| LinkedIn OAuth verification | 🔶 built, not verified — see [Built but not yet verified](#built-but-not-yet-verified) |
| LinkedIn profile prefill (name + photo) | 🔶 built, not verified — see below |
| Tamper-proof verification badge | ✅ working — enforced by DB trigger regardless of LinkedIn flow |
| Ban / hide users | ✅ working — banned users disappear from directory + matching |
| Moderation dashboard (staff web) | 🔶 built, not verified — see below |
| Per-event sponsors / ads | 🔶 built, not verified — see below |
| "Met in person" markers | ✅ private per-user; toggle on profile + badge in lists |
| Private notes + rating per contact | ✅ owner-only; notes textarea + 1–5 stars |
| Per-contact privacy (hide me / hide location) | ✅ enforced in DB (RLS), not just UI |
| Post-meetup follow-ups | ✅ in-app nudge on "met" + Follow-ups list (no push) |
| Multi-language (EN/FR/ES/AR + RTL) | ✅ i18next; in-app switcher; device auto-detect |
| Push notifications | 🔶 not in this draft (Expo Push) |

---

## Prerequisites

- **Node 20 (LTS)** — use exactly this major version, via `nvm install 20 && nvm use 20`.
  Node 22.6+, 23+, 24+, and 26+ all enable TypeScript "type stripping" by default, which
  breaks Expo's config-plugin resolution for packages that ship raw `.ts` source files
  (e.g. `expo-sharing`, `expo-modules-core`) with
  `Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]`. Node 20 predates that feature
  entirely and isn't affected. The repo's `.nvmrc` is pinned to `20` — both your shell
  and EAS Build read it, so run `nvm use` in the project root before installing.
- A free [Supabase](https://supabase.com) project
- A physical device or emulator — chat (Stream) requires a custom dev/preview build and
  **does not run in Expo Go** (`stream-chat-expo` needs native modules)

## Setup

### 1. Install dependencies

```bash
cd conference-meet
npm install
```

### 2. Create the database

In your Supabase project, open **SQL Editor** and run the contents of
[`supabase/schema.sql`](supabase/schema.sql). This creates all tables, RLS policies,
the `suggested_matches` matching function, the new-user trigger, and seed interests.

> Seed the `org_domains` table (or use the moderation dashboard's **Verified orgs** tab)
> with your partner NGOs' email domains — users signing up with those get an auto
> "verified org" badge. National bodies use different domains, so add each one
> (e.g. `wwf.org`, `wwf.org.za`, `wwf.or.ke`); sub-domains match automatically, and
> lookalikes (`wwf-fake.org`) do not.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in from **Supabase → Project Settings → API**:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

The anon key is safe in a client app — RLS is what protects the data.

### 4. Create an event

The app has no organizer UI yet, so insert one event by hand (SQL Editor):

```sql
insert into public.events (name, location, start_date, end_date, description)
values ('COP31', 'Antalya, Türkiye', '2026-11-09', '2026-11-20',
        'Pilot event for civil-society networking.');
```

### 5. Run

```bash
npm start
```

Chat needs a **dev client**, not Expo Go — see the Prerequisites note above. Once a dev
client is installed on your device, run `npx expo start --dev-client` instead.

Scan the QR code with Expo Go, or press `i` / `a` for a simulator (dev-client builds only,
for the non-chat parts of the app Expo Go still works).

To test matching, create **two** accounts (two emails), fill in overlapping interests on
each, join the same event, and open Discover.

> **Do not commit `android/` or `ios/`.** They're gitignored on purpose — this project
> stays on Expo's managed/CNG workflow, where `app.json` is the single source of truth
> for the icon, plugins, and native config, and EAS Build (or `npx expo prebuild`)
> regenerates these folders fresh on every build. If they exist and get committed, EAS
> Build **silently stops syncing `app.json`'s `icon`/`android`/`ios`/`plugins` fields** —
> `npx expo-doctor` will flag this ("app config fields that may not be synced in a
> non-CNG project") if it happens. Fix: `git rm -r --cached android ios`, confirm both
> are in `.gitignore`, delete them locally, and let the next build regenerate them.

---

## Building for Android (EAS)

`eas.json` has three build profiles:

- **`development`** — dev client (`developmentClient: true`), for use with
  `npx expo start --dev-client` during active development.
- **`preview`** — builds an installable **`.apk`** (`android.buildType: "apk"`) for
  sideloading onto a test device. Use this one to just try the app:
  ```bash
  eas build --platform android --profile preview
  ```
- **`production`** — builds an **`.aab`** (Android App Bundle) for the Play Store.
  **`.aab` files can't be installed directly on a device** — only use this profile when
  actually submitting to Play.

**Common pitfall:** `eas build` runs `npm ci` on EAS's servers, which fails hard if
`package.json` and `package-lock.json` are out of sync — including sync issues that only
show up on Linux (EAS's build servers) and not on your Mac. Any time a local
`npm install` / `npx expo install` changes `package-lock.json`, **commit and push it**
before running `eas build`, or the remote build will fail with
`npm ci can only install packages when your package.json and package-lock.json ... are
in sync`.

## Connections model

Connecting with someone is **swipe-only, and one-sided by design** — there is no
"Connect" button, no pending-request state, and no mutual-accept step:

- Swiping **left** on someone in Discover immediately upserts a `connections` row with
  `status = 'accepted'`. Swiping **right** sets `status = 'passed'`. This is a deliberate
  product decision (not a Tinder-style mutual match) — swiping left on someone is enough
  to unlock chat with them, without waiting on the other person to reciprocate.
- The person detail page (`app/person/[id].tsx`) has **no way to initiate a connection**.
  It only shows a **Message** button, and only once `status === 'accepted'` for that pair.
  **Met / notes / privacy / block / report stay available regardless of connection status.**
- Chat is gated on `status === 'accepted'` **both client-side and server-side** — the
  `open-channel` Edge Function independently re-checks the `connections` table (in
  addition to shared-event and ban checks) before creating a channel, so a modified
  client can't bypass the UI and open a channel with someone who hasn't been swiped on.

## Stream Chat (implemented — you just add keys)

Chat is built with [Stream](https://getstream.io) (block/mute/report + moderation come
built in). The Stream **secret never ships in the app** — a Supabase Edge Function mints
per-user tokens.

**How it fits together:**
- `supabase/functions/stream-token/index.ts` — verifies the Supabase session, rejects
  banned users, upserts the user into Stream, returns a token + the public API key.
- `supabase/functions/open-channel/index.ts` — authorizes chat **server-side**: confirms
  the two users share an event, have an **accepted connection** (see
  [Connections model](#connections-model) above), and neither is banned; upserts both
  users into Stream (the peer may never have opened the app themselves); then creates
  the 1:1 channel and returns its id.
- `lib/stream.ts` — client singleton: fetches a token, connects the user, and opens the
  channel returned by `open-channel` (it does not create channels directly).
- `app/chat/[peerId].tsx` — the chat UI (`OverlayProvider` → `Chat` → `Channel` →
  `MessageList` + `MessageInput`).
- `app/person/[id].tsx` — **Message** navigates here (only shown once connected).

> **Implementation note — the Edge Functions do NOT use the `stream-chat` npm/esm SDK.**
> That package depends on `ws`, which has optional native add-ons (`bufferutil`,
> `utf-8-validate`) that Deno's runtime can't resolve — neither via an `esm.sh` URL nor
> Deno's `npm:` specifier — crashing the function at import time
> (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` / a bare `"shutdown"` in the logs with no
> other detail). Both functions instead sign Stream JWTs directly with Deno's built-in
> Web Crypto (`crypto.subtle`, HMAC-SHA256) and call Stream's REST API with `fetch()` —
> no external dependency at all on the Stream side. Channel ids are a SHA-256 hash of the
> sorted member ids (our own deterministic id) rather than relying on Stream's built-in
> "distinct channel" auto-id behavior, which is awkward to trigger over plain REST.

**Setup:**

1. Create a free (nonprofit-eligible) Stream app; copy its **API key** and **secret**.
2. Set them as Edge Function secrets and deploy both functions:
   ```bash
   supabase secrets set STREAM_API_KEY=your_key STREAM_API_SECRET=your_secret
   supabase functions deploy stream-token
   supabase functions deploy open-channel
   ```
3. In the Stream dashboard, go to **Roles & Permissions** (switch to permissions v2 if
   you only see per-channel-type settings) and **deny `CreateChannel` for the `user`
   role** so a client token can't bypass `open-channel`. This only blocks *client-side*
   calls — your Edge Functions use a server token and are unaffected.
4. That's it — swipe left on someone in Discover, then open their profile and tap
   **Message**.

**Client-side dependency pinning (easy to get wrong):**

`stream-chat-expo` bundles its own required `stream-chat` version internally, which
**does not track `stream-chat-expo`'s own version number** — e.g. `stream-chat-expo@8.14.0`
may require `stream-chat@9.52.0` internally. Two things follow from this:

- **Stay on `stream-chat-expo`'s 8.x line**, not 9.x. Stream's v9 is a bigger rewrite
  (requires React Native's New Architecture, renamed `MessageInput` → `MessageComposer`,
  new base UI components) that this app's chat screen isn't written against.
- **Never `npm install stream-chat@<version you pick>` independently.** If it doesn't
  exactly match the version `stream-chat-expo`'s internal core requires, npm keeps two
  separate copies of the `StreamChat` class in `node_modules`, and the app crashes with
  `Cannot read property 'contextType' of undefined` (two different classes both named
  `StreamChat`, so the SDK's internal `instanceof`/context checks fail). Check what's
  actually needed with `npm ls stream-chat` and pin `stream-chat` to that **exact**
  version — you want to see a single `deduped` entry, not two separate resolutions.
  Re-check after any future `stream-chat-expo` upgrade.

> `react-native-reanimated` (a Stream peer dep) needs its Babel plugin, already added in
> `babel.config.js`. If you hit a native/version mismatch, run
> `npx expo install --fix` to align versions with your Expo SDK.

---

## Personal contact tools (met / notes / privacy / follow-ups)

A lightweight personal-CRM layer on top of your contacts. Everything here is **private to
you** and enforced by RLS — covered by the pgTAP suite.

- **Met in person** — flag a contact as met (`met_contacts`). Toggle on the person screen;
  a **"Met" badge** shows on cards in Discover and the Directory.
- **Private notes + rating** — a notes textarea and a 1–5 star rating per contact
  (`contact_notes`). Owner-only; you can only note someone you share an event with.
  (Notes attach to the contact — a distinct "one row per separate meetup" model would be a
  future extension.)
- **Per-contact privacy** — for any contact you can **hide yourself** (you disappear from
  their directory, matches, and profile view) or **hide your location** from them. This is
  enforced in the database: `is_hidden_from()` / `is_location_hidden_from()`
  `SECURITY DEFINER` helpers feed the `users`, `suggested_matches`, and `user_locations`
  policies — so it's real access control, not a UI toggle. Field-level masking (choose
  which individual fields each contact sees) is a larger future option.
- **Post-meetup follow-ups** — right after you mark someone "met", an in-app nudge offers
  to add a note/rating. A **Follow-ups** screen (banner on Discover) lists met contacts you
  haven't noted yet. Real push-delivered reminders remain backlogged (need Expo Push infra).

## Languages / i18n

The app ships in **English, French, Spanish, and Arabic** (with right-to-left layout for
Arabic). It uses `i18next` + `react-i18next`, and `expo-localization` to auto-detect the
device language on first launch; users can override it from the **Language** section on
the Profile screen (the choice is persisted).

- **Catalogs:** `locales/en.json` is the source of truth; `fr.json` / `es.json` /
  `ar.json` mirror its keys. Setup lives in `lib/i18n.ts`.
- **Add a language:** create `locales/<code>.json`, register it in `lib/i18n.ts`
  (`resources` + `SUPPORTED_LANGUAGES`), add its display name under the `language` key in
  every catalog, and add to `RTL_LANGUAGES` if it's right-to-left.
- **RTL note:** flipping to/from Arabic sets the native layout direction; React Native may
  need an **app reload** for the flip to fully apply — expected RN behavior.
- **Not translated:** interest tags and event names are **data** (stored in the DB in
  whatever language they were entered), so they aren't localized by the app. The
  translations here are a first pass — have native speakers review before launch.

## Testing

Because the app is a thin UI over Supabase, most of the real logic lives in Postgres
(RLS policies, the `suggested_matches` scoring, the verification-lock triggers). The test
plan reflects that:

| Layer | Covers | Tooling | Status |
|---|---|---|---|
| **Unit** | Pure logic: geohash, sponsor weighting, language detection | Jest + ts-jest | ✅ **implemented** (17 tests) |
| **DB / RLS** | Policies, matching SQL, verification lock, privacy, org badges, swipe/connections exclusion, storage | pgTAP | ✅ **implemented** (45 tests) |
| **Component** | Screens render/behave given props & state | jest-expo + React Native Testing Library | 🔶 TODO |
| **E2E** | Full flows on device/simulator | Maestro or Detox | 🔶 pre-launch |

**Run the unit tests:**

```bash
npm test          # or: npm run test:watch
```

They cover the dependency-free modules — `lib/geohash.ts`, `lib/sponsors.ts`,
`lib/lang.ts`. Those modules were deliberately extracted to be free of React Native /
Expo imports so they run under plain `ts-jest` (fast, no native runtime).

**Run the DB / RLS tests** (`supabase/tests/rls_test.sql`) — these assert the actual
access-control guarantees and the security-review fixes (H1/H2/M1, sponsors, staff,
verification lock). Two ways:

```bash
# A) With the Supabase CLI (idiomatic; needs the schema applied as a migration)
supabase test db

# B) Standalone, no Supabase CLI — throwaway Postgres container (needs Docker)
./supabase/tests/local/run.sh
```

Option B spins up `postgres:16`, applies the Supabase auth shims
(`supabase/tests/local/`), the schema, and runs the pgTAP suite. For `supabase test db`,
put `schema.sql` into `supabase/migrations/` so the tables exist before the tests run.

> These DB tests already earned their keep: they caught a real bug in `suggested_matches`
> (an array-membership predicate that raised `integer = integer[]` at runtime) before it
> shipped.

## Project structure

```
app/
  _layout.tsx            Auth-gated router root (wrapped in GestureHandlerRootView)
  index.tsx              Redirect to Discover
  (auth)/sign-in.tsx     Email auth (+ LinkedIn OAuth TODO)
  auth/callback.tsx      Handles email-confirmation deep link, exchanges code for session
  (tabs)/
    _layout.tsx          Bottom tabs
    discover.tsx         Swipe deck ("Suggested for you" via matching RPC) — swipe/tap to connect or pass
    directory.tsx        Browse/join events, attendee directory + filters
    profile.tsx          Edit profile, interests, photo upload, opt-in location
  person/[id].tsx        Profile detail: chat (once connected) / met / notes / privacy / block
  chat/[peerId].tsx      Stream 1:1 chat screen
  follow-ups.tsx         Met contacts you haven't noted yet
components/
  Avatar.tsx             Photo with initials fallback
  StarRating.tsx         1–5 star rating input
  PersonCard.tsx
  SwipeDeck.tsx           Stacked swipeable card deck (Reanimated + Gesture Handler) + tap-to-swipe buttons
  SponsorBanner.tsx      Per-event sponsor ad banner
context/AuthContext.tsx
lib/
  supabase.ts            Supabase client
  types.ts               Schema types (replaceable with generated types)
  theme.ts               Colors/spacing
  location.ts            Location sharing (permission, upsert, kill switch)
  geohash.ts             Pure geohash encoding (unit-tested)
  sponsors.ts            Pure sponsor weighted-pick (unit-tested)
  lang.ts                Pure language normalize / RTL helpers (unit-tested)
  oauth.ts               LinkedIn sign-in (PKCE) + verified-badge bump
  stream.ts              Stream client connection + 1:1 channel helper
  i18n.ts                i18next setup, device detection, RTL, language switch
  useActiveEvent.ts      Picks the user's current event
__tests__/
  geohash.test.ts sponsors.test.ts lang.test.ts   Unit tests (Jest + ts-jest)
locales/
  en.json fr.json es.json ar.json   Translation catalogs (en = source of truth)
supabase/
  schema.sql             Tables, RLS, matching fn, triggers, verification lock, seed
  functions/stream-token Edge Function that mints Stream tokens
  functions/open-channel Edge Function that authorizes + opens a 1:1 chat channel
  tests/rls_test.sql     pgTAP RLS / security tests (supabase test db)
  tests/local/           Docker runner + auth shims for running them without the CLI
moderation/
  index.html             Standalone staff dashboard (reports, verify, ban, sponsors, org domains)
  config.example.js      Copy to config.js with your project URL + anon key
```

## Notes & caveats

- **This is a draft.** It prioritizes a correct data model and the core loop over polish.
- **Location is coarse and opt-in by design** — the app only ever stores a ~5km geohash
  with an expiry, and the row is hard-deleted when a user stops sharing. Given the target
  audience (activists/journalists), have the NGO's safeguarding/legal sign off before
  enabling it in production.
## Built but not yet verified

These three features are fully coded and wired up, but **haven't been run end-to-end**
the way chat, connections, and the rest of the "What's implemented" table have this
session — treat the instructions below as a starting point, not a confirmed-working
guide, and budget time to debug them the first time through.

### LinkedIn OAuth (verified badge + profile prefill)

Signing in with LinkedIn gives the user a **verified** badge. The badge is
tamper-proof: a DB trigger blocks users from setting their own
`verification_level` / `is_staff` / `is_banned`, and a `SECURITY DEFINER` RPC
(`mark_linkedin_verified`) is the only client path to raise the badge — and only
to `linkedin`, never downgrading a stronger `org_domain` / `manual` level.

The same RPC also **prefills the profile from LinkedIn** — reading the OpenID Connect
claims Supabase stored on `auth.users`, and filling `name` + `photo_url` **only when the
user hasn't set them** (so it never clobbers manual edits). Photos render throughout the
app (`components/Avatar.tsx`, with an initials fallback).

> **LinkedIn limitation:** LinkedIn's OpenID Connect only exposes **name, picture, and
> email**. **Bio, headline, and current organization are NOT available** without LinkedIn
> Partner API approval, so those remain manual entry. Auto-filling them would require
> being accepted into LinkedIn's Partner Program and using their Profile API.

**Setup:**

1. In Supabase → **Authentication → Providers**, enable **LinkedIn (OIDC)** and
   paste your LinkedIn app's client id + secret.
2. In your LinkedIn developer app, add the Supabase callback URL
   (`https://<ref>.supabase.co/auth/v1/callback`) as an authorized redirect.
3. The app already requests the right scopes and handles the PKCE code exchange
   (`lib/oauth.ts`); the "Continue with LinkedIn" button is on the sign-in screen.

### Moderation dashboard (`moderation/`)

A **standalone, build-free web app** for NGO staff — no framework, no service-role
key. It signs in as a staff user and every action is gated by Row-Level Security.

**What it does:** review the reports queue (resolve / ban), and search users to
**verify (manual)** or **ban/unban**. Banned users vanish from the app's directory
and matches automatically.

**Setup:**

1. `cp moderation/config.example.js moderation/config.js` and fill in your project
   URL + anon key (both browser-safe; RLS is the gate).
2. Make a moderator: sign that person up in the app, then in SQL:
   ```sql
   update public.users set is_staff = true
   where id = (select id from auth.users where email = 'moderator@your-ngo.org');
   ```
3. Serve the folder and open it:
   ```bash
   npx serve moderation
   ```
   Sign in with the staff account. Non-staff accounts are rejected.

### Sponsors / ads

Events can have one or more **sponsors** whose ads appear as a tappable banner in the
app. Ads are **opt-in per event** — an event with no active sponsors shows no ads at all.

- **In the app:** `components/SponsorBanner.tsx` shows one active sponsor for the current
  event on the Discover and Directory screens, rotating every ~12s when there are several
  (weighted by each sponsor's `weight`). Tapping opens the sponsor's link. Renders nothing
  when there are no sponsors — **except in dev builds** (`__DEV__`), where a hardcoded
  fake sponsor is shown as a fallback so the banner can be tested/styled without seeding
  real sponsor rows. Never shown in production builds; safe to leave in place. **This dev
  fallback has been verified working** — it's the surrounding real-sponsor path (seeding
  actual `sponsors` rows, the moderation dashboard's Sponsors tab) that hasn't been tested.
- **Management:** the **Sponsors** tab in the moderation dashboard lets staff pick an
  event and add / hide / delete sponsors (name, tagline, logo URL, link URL, weight).
- **Data & access:** the `sponsors` table is per-event; RLS lets event attendees read only
  *active* sponsors for events they've joined, and lets staff manage all.
- **Analytics (not built):** `SponsorBanner` has a marked spot to record click-throughs
  (e.g. a `sponsor_clicks` insert) if the NGO wants to report engagement to sponsors.

> This is the revenue lever from the plan (sponsor-funded, ad-free via subscription later).
> The subscription/ad-opt-out path is not built yet.

## TODO / backlog

Known future work, not built in this draft:

- [ ] **Sponsor click / impression tracking** — record banner clicks (and optionally
  impressions) so the NGO can report engagement to sponsors. There's a marked spot in
  `components/SponsorBanner.tsx`; add a `sponsor_clicks` table (or an Edge Function) and
  log on tap.
- [ ] **Subscription / ad-opt-out** — let users pay to hide sponsor ads (the plan's
  alternative to the ad model).
- [ ] **Richer LinkedIn import (bio/headline/org)** — requires LinkedIn Partner Program
  approval + their Profile API; OIDC alone can't provide these fields.
- [ ] **Field-level per-contact privacy** — choose which individual fields each contact
  sees (needs a masked-profile view/RPC). Current privacy is hide-me / hide-location.
- [ ] **Per-meetup notes** — model discrete meetups (one note/rating per meeting) instead
  of one note per contact.
- [ ] **Push-delivered follow-up reminders** — needs the (backlogged) Expo Push infra.
- [ ] **Push notifications** (Expo Push) — new match / message / connection request.
- [ ] **Event-creation UI** — events are currently inserted via SQL; add an organizer flow.
- [ ] **Rate limiting** on connection requests and reports (abuse hardening).
- [ ] **Generated DB types** — replace the hand-written `lib/types.ts` with
  `supabase gen types typescript`.
- [ ] **Low-severity security items** from the review — connection self-accept (L1),
  report spam (L2), Stream CORS origin lock (L3).
- [x] **DB / RLS tests** (pgTAP) — verify access-control policies, matching SQL, and the
  verification lock. See `supabase/tests/`.
- [ ] **Component tests** (jest-expo + React Native Testing Library) for the key screens.
- [ ] **E2E tests** (Maestro/Detox) for the core sign-up → match → chat flow.
- [ ] **Run on a real device** and run `schema.sql` against a live Supabase project to
  verify policies/triggers apply cleanly.
