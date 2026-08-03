# ConferenceMeet — v1 MVP Plan

## Guiding principle

Ship the smallest app that lets a verified attendee of **one flagship event** discover
relevant people and start a conversation. Everything is measured against one question:
*did real people meet who otherwise wouldn't have?* If a feature doesn't move that, it's v2.

---

## 1. What's IN v1 (must-have)

**Onboarding & identity**
- Sign up via email + one OAuth provider (LinkedIn strongly preferred — gives verified name/role/org for free)
- Profile: name, photo, headline, organization, role/category (NGO, journalist, researcher, activist, youth delegate, other), short bio
- **Interest tags** — pick from a curated list (~30–50 tags) + free-text. Curated beats free-form for matching quality.
- **Intent field** — "What I'm hoping to get from this event" (1–2 sentences). This is your differentiator; don't cut it.

**Verification (layered, all free tiers)**
- Email verification (baseline)
- Org-domain auto-badge (`@wwf.org` → "Verified org" checkmark)
- LinkedIn-linked badge
- Manual/vouch review path for those without the above (staff-reviewed queue)

**The event**
- A single event exists at launch (the NGO's flagship). Users **join** it to appear in its directory.
- (Building for one event, but model it as multi-event from day one — see data model.)

**Discovery — the core loop**
- Browse/search attendees of the event, filterable by role + interest tags
- **"Suggested for you"** — a ranked list based on shared interests + complementary intent (simple algorithm, see §4)
- View a person's profile

**Connect**
- Send a connection request or open a chat (decide one; suggest allowing direct message but gate with rate limits)
- 1:1 chat (via Stream — includes moderation)
- **Block & report** on every profile and chat — non-negotiable for this audience

**Location & proximity (opt-in)**
- **Off by default** — location is never tracked silently
- **Coarse / zone-level only** — show "in the Blue Zone," "Hall 4," or an approximate area, never precise coordinates to other users
- **Ephemeral sharing** — "share my location for the next 2 hours," then auto-expires
- **Instant kill switch** — one tap to go invisible
- Use cases: "who's near me right now," "find people in this session/hall," coordinate an ad-hoc meetup
- Privacy note: given the audience (activists/journalists/delegates from sensitive contexts), coarse + opt-in + ephemeral is a hard requirement, not a preference

**Notifications**
- Push: "New people matching your interests just joined," "New message," "X wants to connect," "Someone with shared interests is nearby" (only if both opted into location)

**Safety & admin**
- Basic moderation dashboard for NGO staff: review verification queue, handle reports, ban users
- Code of conduct shown at signup

---

## 2. What's OUT of v1 (deliberately deferred)

- "Add any event" / user-created events → **this is the biggest cut.** Launch one event, avoid the ghost-town problem.
- Meeting scheduling / calendar integration
- Group chats, forums, feeds
- Precise / continuous GPS tracking or location history — only coarse, opt-in, ephemeral location is in v1 (see §1)
- ML matching model — start with SQL, not TensorFlow
- In-app video calls
- Ads / subscriptions / payments — irrelevant at pilot stage
- Web version (nice later for sharing; not required to prove the core loop)

---

## 3. Core data model

Keep it multi-event-ready even though you launch with one.

- **users** — id, name, photo_url, headline, org, role, bio, intent_text, verification_level (none / email / linkedin / org_domain / manual), created_at
- **interests** — id, label, category (the curated tag list)
- **user_interests** — user_id, interest_id (many-to-many)
- **events** — id, name, location, start_date, end_date, description, status
- **event_attendees** — user_id, event_id, joined_at (this is what powers each event's directory)
- **connections** — requester_id, recipient_id, status (pending/accepted/blocked), created_at
- **user_locations** — user_id, event_id, zone_label (e.g. "Blue Zone", "Hall 4"), approx_area (coarse geohash, low precision), sharing_expires_at, updated_at. Row is deleted/expired, never kept as history.
- **messages** — handled by Stream (don't store in your DB beyond references)
- **reports** — reporter_id, reported_user_id, reason, status, created_at

Enforce with row-level security: a user can only see attendees of events they've joined,
and only message people at a shared event.

---

## 4. Matching logic for v1 (simple, no ML)

Score each candidate for a given user and rank:

```
score = (shared_interest_tags × 3)
      + (same_role bonus OR complementary_role bonus × 2)
      + (intent keyword overlap × 1)
```

That's a plain Postgres query. It's explainable ("you both tagged *climate finance*"),
cheap, and good enough to prove the concept. Show the *reason* for each match — that's
what makes it feel smart. Add real ML only once you have enough users and data that it
measurably beats this.

---

## 5. Build sequence (phased)

**Phase 0 — Foundations (before features)**
Auth + user table + profile CRUD + verification badges. Get one person able to sign up,
verify, and edit a profile.

**Phase 1 — The directory**
Events, join-an-event, browse/search/filter attendees. Now the NGO can seed real profiles
and *see* a populated directory.

**Phase 2 — Matching**
Interest tags + the scoring query + "Suggested for you." This is the "aha."

**Phase 3 — Connect**
Integrate Stream chat, connection requests, block/report.

**Phase 3.5 — Location & proximity (opt-in)**
`expo-location` with foreground permission only, coarse accuracy. Zone/area display,
ephemeral sharing with expiry, kill switch, "nearby" surfacing. Ship after core connect
works so the app is useful even for users who never enable location.

**Phase 4 — Notifications + admin**
Push notifications + the staff moderation/verification dashboard.

**Phase 5 — Harden for a live event**
Rate limits, abuse handling, load-test the directory, dry-run with ~30 real users.
OTA updates ready so you can hotfix during the event.

Realistic build estimate for one competent full-stack RN developer: **~8–12 weeks** to a pilot-ready app.

---

## 6. The launch playbook (this matters as much as the code)

The app can be perfect and still fail if the event directory is empty. So:

- **Pre-seed before the event.** Get the NGO to onboard its own network + partner
  delegations *weeks ahead*, so someone opening the app on day 1 sees hundreds of real
  people, not an empty screen.
- **Set a liquidity floor.** Don't promote the app for an event until it has ~100+ verified attendees.
- **One event, done well.** Concentrate all users in one place rather than spreading thin.

---

## 7. Success metrics for the pilot

- % of signups that complete a verified profile (target the profile-completion cliff early)
- % of active users who send ≥1 connection request or message
- Number of **accepted** connections / conversations started
- Post-event survey: *"Did you meet someone through the app you wouldn't have otherwise?"* ← the real KPI
- Safety: reports per 100 users, time-to-resolution

---

## Recommended tech stack (reference)

- **Frontend:** Expo (React Native) — one codebase for iOS + Android, EAS Build/Submit, OTA updates
- **Backend:** Supabase — Postgres, Auth, Row-Level Security, Storage, Edge Functions (~$0–25/mo)
- **Chat:** Stream (getstream.io) — includes blocking, reporting, moderation; free/nonprofit tiers
- **Push:** Expo Push (free)
- **Location:** `expo-location` — foreground-only, coarse accuracy; derive zone/geohash client-side, never store precise coordinates. Realistic estimate adds ~1–2 weeks to the build.
- **Verification (cheapest first):** email → org email domain → LinkedIn OAuth → badge photo review → vouching. Paid SMS (Twilio) only if abuse appears.
- **Estimated cost:** ~$0–50/month at pilot scale (plus $99/yr Apple + $25 one-time Google dev accounts)

---

## Next steps

- (a) Turn §5 into a tracked task/ticket list
- (b) Draft the curated interest-tag list for COP / climate-civil-society specifically
- (c) Scaffold the starter Expo + Supabase project
