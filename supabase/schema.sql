-- ConferenceMeet — v1 schema
-- Run this in the Supabase SQL editor (or `supabase db push`) against a fresh project.
-- Mirrors section 3 of the MVP plan. Multi-event ready; launch with one event.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type role_category as enum (
  'ngo', 'journalist', 'researcher', 'activist', 'youth_delegate', 'other'
);

create type verification_level as enum (
  'none', 'email', 'linkedin', 'org_domain', 'manual'
);

create type connection_status as enum ('pending', 'accepted', 'blocked');

-- ---------------------------------------------------------------------------
-- users  (profile rows; 1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  name               text not null default '',
  photo_url          text,
  headline           text,
  org                text,
  role               role_category not null default 'other',
  bio                text,
  intent_text        text,                       -- "what I want from this event" — the differentiator
  verification_level verification_level not null default 'none',
  is_staff           boolean not null default false,  -- can access the moderation dashboard
  is_banned          boolean not null default false,  -- hidden from everyone; set by staff
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- interests  (curated tag list) + join table
-- ---------------------------------------------------------------------------
create table public.interests (
  id       serial primary key,
  label    text not null unique,
  category text
);

create table public.user_interests (
  user_id     uuid not null references public.users (id) on delete cascade,
  interest_id int  not null references public.interests (id) on delete cascade,
  primary key (user_id, interest_id)
);

-- ---------------------------------------------------------------------------
-- org_domains  (email domains that confer an automatic "verified org" badge)
-- National bodies of the same NGO use different domains — wwf.org, wwf.org.za,
-- wwf.or.ke, panda.org … — so this is a staff-managed allowlist, not a fixed
-- array. Matching covers exact domains AND their sub-domains (see is_org_email).
-- ---------------------------------------------------------------------------
create table public.org_domains (
  domain     text primary key,   -- stored lowercase, e.g. 'wwf.or.ke'
  org_name   text,               -- optional label, e.g. 'WWF Kenya'
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events + attendance
-- ---------------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text,
  start_date  date,
  end_date    date,
  description text,
  status      text not null default 'active'
);

create table public.event_attendees (
  user_id   uuid not null references public.users (id) on delete cascade,
  event_id  uuid not null references public.events (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ---------------------------------------------------------------------------
-- connections
-- ---------------------------------------------------------------------------
create table public.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  status       connection_status not null default 'pending',
  created_at   timestamptz not null default now(),
  unique (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

-- ---------------------------------------------------------------------------
-- user_locations  (opt-in, coarse, EPHEMERAL — never a history log)
-- One row per user; overwritten on update, hard-deleted when sharing stops.
-- ---------------------------------------------------------------------------
create table public.user_locations (
  user_id           uuid primary key references public.users (id) on delete cascade,
  event_id          uuid not null references public.events (id) on delete cascade,
  zone_label        text,          -- e.g. "Blue Zone", "Hall 4"
  approx_area       text,          -- low-precision geohash (~1km), derived client-side
  sharing_expires_at timestamptz not null,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reports  (safety)
-- ---------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.users (id) on delete cascade,
  reported_user_id uuid not null references public.users (id) on delete cascade,
  reason           text,
  status           text not null default 'open',
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sponsors  (per-event advertisers; ads shown in-app)
-- Optional by design: if an event has no active sponsors, no ads are shown.
-- ---------------------------------------------------------------------------
create table public.sponsors (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null,
  logo_url   text,
  tagline    text,
  link_url   text,          -- opened when the banner is tapped
  weight     int  not null default 1,     -- higher = shown more often
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- met_contacts  (personal "I met this person in real life" marker)
-- Directional & private: each row is one user's note that they met someone.
-- ---------------------------------------------------------------------------
create table public.met_contacts (
  user_id    uuid not null references public.users (id) on delete cascade,
  contact_id uuid not null references public.users (id) on delete cascade,
  met_at     timestamptz not null default now(),
  primary key (user_id, contact_id),
  check (user_id <> contact_id)
);

-- ---------------------------------------------------------------------------
-- contact_notes  (private notes + rating a user keeps about a contact)
-- ---------------------------------------------------------------------------
create table public.contact_notes (
  owner_id   uuid not null references public.users (id) on delete cascade,
  contact_id uuid not null references public.users (id) on delete cascade,
  note       text,
  rating     smallint check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

-- ---------------------------------------------------------------------------
-- contact_privacy  (per-contact visibility a user sets for themselves)
-- hidden        -> that contact can't see you at all (directory, matches, profile)
-- hide_location -> that contact can't see your location even while you share
-- ---------------------------------------------------------------------------
create table public.contact_privacy (
  owner_id      uuid not null references public.users (id) on delete cascade,
  contact_id    uuid not null references public.users (id) on delete cascade,
  hidden        boolean not null default false,
  hide_location boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

-- ===========================================================================
-- Helper: do the current user and target user share at least one event?
-- (Basis for "you can only see/contact people at your events.")
-- ===========================================================================
create or replace function public.shares_event_with (target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from event_attendees me
    join event_attendees them on them.event_id = me.event_id
    where me.user_id = auth.uid()
      and them.user_id = target
  );
$$;

-- ===========================================================================
-- Is the current user a staff/moderator?
-- ===========================================================================
create or replace function public.is_staff ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_staff from users where id = auth.uid()), false);
$$;

-- ===========================================================================
-- Does an email's domain earn the "verified org" badge? Matches a listed domain
-- exactly, or as a parent of a sub-domain (e.g. 'wwf.or.ke' also verifies
-- 'nairobi.wwf.or.ke'). A lookalike like 'wwf-fake.org' does NOT match.
-- SECURITY DEFINER so it can read the allowlist during signup.
-- ===========================================================================
create or replace function public.is_org_email (p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_domains od
    where lower(split_part(p_email, '@', 2)) = od.domain
       or lower(split_part(p_email, '@', 2)) like '%.' || od.domain
  );
$$;

-- ===========================================================================
-- Per-contact privacy checks. SECURITY DEFINER so the visibility policies can
-- read the owner's contact_privacy rows even when the caller is the contact.
-- "Has p_owner hidden the current viewer?"
-- ===========================================================================
create or replace function public.is_hidden_from (p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from contact_privacy
    where owner_id = p_owner and contact_id = auth.uid() and hidden
  );
$$;

create or replace function public.is_location_hidden_from (p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from contact_privacy
    where owner_id = p_owner and contact_id = auth.uid() and (hidden or hide_location)
  );
$$;

-- ===========================================================================
-- Lock privileged columns against self-service edits.
-- A normal user must NOT be able to set their own verification_level, is_staff,
-- or is_banned (that would make the "verified" badge meaningless). Only staff,
-- or a definer function that opts in via a session flag, may change them.
-- ===========================================================================
create or replace function public.protect_user_columns ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff()
     or current_setting('app.bypass_user_lock', true) = 'on' then
    return new; -- staff (or a trusted definer function) may change anything
  end if;
  if tg_op = 'INSERT' then
    -- M1: a self-service INSERT must not be able to grant itself privileges.
    new.verification_level := 'none';
    new.is_staff           := false;
    new.is_banned          := false;
  else
    new.verification_level := old.verification_level;
    new.is_staff           := old.is_staff;
    new.is_banned          := old.is_banned;
  end if;
  return new;
end;
$$;

create trigger protect_user_columns_trg
  before insert or update on public.users
  for each row execute function public.protect_user_columns();

-- Called by the app after a successful LinkedIn sign-in. Runs as owner and opts
-- into the bypass flag so it can raise the badge, but never downgrades a stronger
-- level (org_domain / manual).
--
-- Also prefills name + photo from the LinkedIn OpenID Connect claims that Supabase
-- stored on auth.users.raw_user_meta_data — but ONLY for fields the user hasn't set,
-- so it never clobbers manual edits.
--   NOTE: LinkedIn OIDC only exposes name / picture / email. Bio, headline, and
--   current organization are NOT available without LinkedIn Partner API approval, so
--   those stay manual.
create or replace function public.mark_linkedin_verified ()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
begin
  perform set_config('app.bypass_user_lock', 'on', true);

  select raw_user_meta_data into meta from auth.users where id = auth.uid();

  update public.users u
     set verification_level = case
           when u.verification_level in ('none', 'email') then 'linkedin'::verification_level
           else u.verification_level
         end,
         -- fill name only if empty (name is NOT NULL, so fall back to itself)
         name = case
           when coalesce(u.name, '') = ''
             then coalesce(meta ->> 'name', meta ->> 'full_name', u.name)
           else u.name
         end,
         -- fill photo only if not already set
         photo_url = coalesce(u.photo_url, meta ->> 'picture', meta ->> 'avatar_url')
   where u.id = auth.uid();
end;
$$;

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table public.users           enable row level security;
alter table public.user_interests  enable row level security;
alter table public.events          enable row level security;
alter table public.event_attendees enable row level security;
alter table public.connections     enable row level security;
alter table public.user_locations  enable row level security;
alter table public.reports         enable row level security;
alter table public.sponsors        enable row level security;
alter table public.met_contacts    enable row level security;
alter table public.contact_notes   enable row level security;
alter table public.contact_privacy enable row level security;
alter table public.org_domains     enable row level security;
-- interests is a public read-only lookup table (policy below); RLS left off intentionally.

-- users: you can read your own row, and non-banned people who share an event with
-- you. Staff can read everyone (for the moderation dashboard).
create policy "read self or co-attendees" on public.users
  for select using (
    id = auth.uid()
    or (public.shares_event_with(id) and is_banned = false and not public.is_hidden_from(id))
    or public.is_staff()
  );

create policy "insert own profile" on public.users
  for insert with check (id = auth.uid());

-- Self-updates are allowed, but the protect_user_columns trigger prevents a
-- non-staff user from touching verification_level / is_staff / is_banned.
create policy "update own profile" on public.users
  for update using (id = auth.uid());

-- Staff can update any user (verify, ban/unban).
create policy "staff update any user" on public.users
  for update using (public.is_staff());

-- user_interests: read for anyone you can see; write only your own.
create policy "read interests of visible users" on public.user_interests
  for select using (user_id = auth.uid() or public.shares_event_with(user_id));
create policy "write own interests" on public.user_interests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- events: readable by all authenticated users (so they can discover & join).
create policy "events readable" on public.events
  for select using (auth.role() = 'authenticated');

-- interests: reference/lookup table, readable by all authenticated users so
-- they can select tags on their profile.
create policy "interests readable" on public.interests
  for select using (auth.role() = 'authenticated');

-- event_attendees: read attendance for events you're in; join/leave only as yourself.
-- H2: use the SECURITY DEFINER helper instead of a subquery on this same table —
-- a self-referential policy triggers "infinite recursion detected in policy".
create policy "read co-attendance" on public.event_attendees
  for select using (
    user_id = auth.uid()
    or public.shares_event_with(user_id)
  );
create policy "join as self" on public.event_attendees
  for insert with check (user_id = auth.uid());
create policy "leave as self" on public.event_attendees
  for delete using (user_id = auth.uid());

-- connections: visible to the two parties; created by the requester.
create policy "read own connections" on public.connections
  for select using (requester_id = auth.uid() or recipient_id = auth.uid());
create policy "create as requester" on public.connections
  for insert with check (requester_id = auth.uid() and public.shares_event_with(recipient_id));
create policy "update if party" on public.connections
  for update using (requester_id = auth.uid() or recipient_id = auth.uid());

-- user_locations: readable only for co-attendees with non-expired sharing; write own.
create policy "read live co-attendee locations" on public.user_locations
  for select using (
    sharing_expires_at > now()
    and (
      user_id = auth.uid()
      or (public.shares_event_with(user_id) and not public.is_location_hidden_from(user_id))
    )
  );
create policy "write own location" on public.user_locations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports: a user can file reports; staff read and resolve them.
create policy "file own reports" on public.reports
  for insert with check (reporter_id = auth.uid());
create policy "staff read reports" on public.reports
  for select using (public.is_staff());
create policy "staff update reports" on public.reports
  for update using (public.is_staff());

-- sponsors: attendees see active sponsors for events they've joined; staff manage all.
create policy "read active sponsors for my events" on public.sponsors
  for select using (
    (
      is_active = true
      and event_id in (select event_id from public.event_attendees where user_id = auth.uid())
    )
    or public.is_staff()
  );
create policy "staff manage sponsors" on public.sponsors
  for all using (public.is_staff()) with check (public.is_staff());

-- met_contacts: private to the owner. You can mark someone you share an event with,
-- read only your own markers, and remove your own.
create policy "read own met contacts" on public.met_contacts
  for select using (user_id = auth.uid());
create policy "mark met (shared event)" on public.met_contacts
  for insert with check (user_id = auth.uid() and public.shares_event_with(contact_id));
create policy "unmark own met contact" on public.met_contacts
  for delete using (user_id = auth.uid());

-- contact_notes: strictly private to the owner. Can only note a co-attendee.
create policy "read own notes" on public.contact_notes
  for select using (owner_id = auth.uid());
create policy "write own notes" on public.contact_notes
  for insert with check (owner_id = auth.uid() and public.shares_event_with(contact_id));
create policy "update own notes" on public.contact_notes
  for update using (owner_id = auth.uid());
create policy "delete own notes" on public.contact_notes
  for delete using (owner_id = auth.uid());

-- contact_privacy: strictly private to the owner. Can only set for a co-attendee.
create policy "read own privacy" on public.contact_privacy
  for select using (owner_id = auth.uid());
create policy "write own privacy" on public.contact_privacy
  for insert with check (owner_id = auth.uid() and public.shares_event_with(contact_id));
create policy "update own privacy" on public.contact_privacy
  for update using (owner_id = auth.uid());
create policy "delete own privacy" on public.contact_privacy
  for delete using (owner_id = auth.uid());

-- org_domains: only staff manage the verified-org allowlist. (The signup badge
-- check uses is_org_email(), a SECURITY DEFINER function, so no public read.)
create policy "staff manage org domains" on public.org_domains
  for all using (public.is_staff()) with check (public.is_staff());

-- interests lookup: allow read to all authenticated users via a permissive grant.
grant select on public.interests to authenticated;

-- ===========================================================================
-- Matching  (section 4 of the plan — plain SQL, no ML)
-- score = shared_interest_tags*3 + role_bonus*2 + intent_keyword_overlap*1
-- Returns ranked candidates for the current user within one event, with a
-- human-readable reason ("you both tagged: climate finance").
-- ===========================================================================
create or replace function public.suggested_matches (p_event_id uuid, p_limit int default 30)
returns table (
  user_id  uuid,
  name     text,
  headline text,
  org      text,
  role     role_category,
  photo_url text,
  verification_level verification_level,
  score    int,
  shared_interests text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, role,
           coalesce(intent_text, '') as intent,
           array(select interest_id from user_interests where user_id = auth.uid()) as my_interests
    from users where id = auth.uid()
  ),
  candidates as (
    select u.*
    from users u
    join event_attendees ea on ea.user_id = u.id and ea.event_id = p_event_id
    where u.id <> auth.uid()
      and u.is_banned = false
      -- respect per-contact privacy: don't surface people who hid from the caller
      and not public.is_hidden_from(u.id)
      -- H1: the caller must themselves be an attendee of this event, otherwise
      -- this SECURITY DEFINER function would leak attendees of events they
      -- haven't joined. If they aren't in the event, candidates is empty.
      and exists (
        select 1 from event_attendees mine
        where mine.user_id = auth.uid() and mine.event_id = p_event_id
      )
      -- exclude anyone already blocked in either direction
      and not exists (
        select 1 from connections c
        where c.status = 'blocked'
          and ((c.requester_id = auth.uid() and c.recipient_id = u.id)
            or (c.requester_id = u.id and c.recipient_id = auth.uid()))
      )
  ),
  scored as (
    select
      c.id, c.name, c.headline, c.org, c.role, c.photo_url, c.verification_level,
      -- shared interest tags * 3
      (select count(*) from user_interests ui
        where ui.user_id = c.id and ui.interest_id in (select unnest(my_interests) from me)) as shared_count,
      -- role bonus: same role or a "complementary" pairing (journalist<->ngo, researcher<->activist)
      case
        when c.role = (select role from me) then 2
        when (c.role, (select role from me)) in
             (('journalist','ngo'),('ngo','journalist'),
              ('researcher','activist'),('activist','researcher')) then 2
        else 0
      end as role_bonus,
      -- crude intent overlap: shared significant words (length > 4)
      (select count(distinct w) from (
        select unnest(string_to_array(lower(regexp_replace(coalesce(c.intent_text,''), '[^a-z ]', '', 'gi')), ' ')) as w
        intersect
        select unnest(string_to_array(lower(regexp_replace((select intent from me), '[^a-z ]', '', 'gi')), ' ')) as w
      ) t where length(w) > 4) as intent_overlap
    from candidates c
  )
  select
    s.id, s.name, s.headline, s.org, s.role, s.photo_url, s.verification_level,
    (s.shared_count * 3 + s.role_bonus + s.intent_overlap)::int as score,
    array(
      select i.label from user_interests ui
      join interests i on i.id = ui.interest_id
      where ui.user_id = s.id and ui.interest_id in (select unnest(my_interests) from me)
      limit 5
    ) as shared_interests
  from scored s
  order by score desc, s.verification_level desc
  limit p_limit;
$$;

-- ===========================================================================
-- Auto-create a profile row when a new auth user signs up, and stamp the
-- verification level from their email domain (cheapest strong signal). The set
-- of recognized org domains lives in the org_domains table (manage via the
-- moderation dashboard) so national domains can be added per country.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- This trusted server path is allowed to set the initial verification_level,
  -- so opt past the protect_user_columns INSERT guard (transaction-local).
  perform set_config('app.bypass_user_lock', 'on', true);
  insert into public.users (id, name, verification_level)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when public.is_org_email(new.email) then 'org_domain'::verification_level
         else 'email'::verification_level end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Seed: a starter curated interest list (trim/extend for your event)
-- ===========================================================================
insert into public.interests (label, category) values
  ('Climate finance', 'Finance'),
  ('Renewable energy', 'Energy'),
  ('Just transition', 'Policy'),
  ('Loss & damage', 'Policy'),
  ('Adaptation & resilience', 'Policy'),
  ('Biodiversity', 'Nature'),
  ('Ocean & coasts', 'Nature'),
  ('Deforestation', 'Nature'),
  ('Indigenous rights', 'Rights'),
  ('Youth & education', 'Rights'),
  ('Gender & climate', 'Rights'),
  ('Human rights', 'Rights'),
  ('Carbon markets', 'Finance'),
  ('Green hydrogen', 'Energy'),
  ('Food & agriculture', 'Systems'),
  ('Water security', 'Systems'),
  ('Urban & transport', 'Systems'),
  ('Climate journalism', 'Media'),
  ('Data & transparency', 'Media'),
  ('Grassroots organising', 'Advocacy')
on conflict (label) do nothing;

-- ===========================================================================
-- Seed the verified-org allowlist. Add each NGO's national domains here (or via
-- the moderation dashboard). Sub-domains are matched automatically.
-- ===========================================================================
insert into public.org_domains (domain, org_name) values
  ('wwf.org',    'WWF International'),
  ('panda.org',  'WWF'),
  ('wwf.org.za', 'WWF South Africa'),
  ('wwf.or.ke',  'WWF Kenya'),
  ('wwf.org.uk', 'WWF United Kingdom'),
  ('greenpeace.org', 'Greenpeace'),
  ('unfccc.int', 'UNFCCC')
on conflict (domain) do nothing;

-- ===========================================================================
-- Add test event
-- ===========================================================================

insert into public.events (name, location, start_date, end_date, description)
values ('COP31', 'Antalya, Türkiye', '2026-11-09', '2026-11-20',
        'Pilot event for civil-society networking.');

-- ===========================================================================
-- Bootstrap a moderator: sign the person up in the app first, then run:
--   update public.users set is_staff = true where id =
--     (select id from auth.users where email = 'moderator@your-ngo.org');
-- They can then sign in to the moderation dashboard (see moderation/).
-- ===========================================================================
