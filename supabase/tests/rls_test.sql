-- pgTAP tests for ConferenceMeet Row-Level Security + the security-review fixes.
--
-- Run with the Supabase CLI:   supabase test db
-- (requires the schema to be applied as a migration first — see README > Testing).
--
-- What these assert:
--   * users visibility: self + non-banned co-attendees only; banned hidden; staff see all
--   * H1  suggested_matches does not leak attendees of events you haven't joined
--   * H2  event_attendees co-attendance query runs (no infinite-recursion policy)
--   * M1  a non-staff user cannot self-assign verification_level / is_staff / is_banned
--   * verification: mark_linkedin_verified() raises the badge but never downgrades
--   * connections: creating one requires a shared event
--   * sponsors: attendees see only active sponsors for their events; staff manage all
--   * reports: only staff can read them

begin;
select plan(40);

-- Fixed UUIDs for deterministic fixtures.
-- alice/bob/carol attend E1; dave attends E2; mod is staff; org has an org-domain email.
\set alice '00000000-0000-0000-0000-0000000000a1'
\set bob   '00000000-0000-0000-0000-0000000000b2'
\set carol '00000000-0000-0000-0000-0000000000c3'
\set dave  '00000000-0000-0000-0000-0000000000d4'
\set moder '00000000-0000-0000-0000-0000000000e5'
\set orgu  '00000000-0000-0000-0000-0000000000f6'
\set e1    '00000000-0000-0000-0000-00000000e111'
\set e2    '00000000-0000-0000-0000-00000000e222'
-- users for the LinkedIn prefill tests
\set pat   '00000000-0000-0000-0000-0000000000a7'
\set quinn '00000000-0000-0000-0000-0000000000a8'
\set rob   '00000000-0000-0000-0000-0000000000a9'
-- sam: a clean co-attendee of E1 used for the location-privacy test
\set sam   '00000000-0000-0000-0000-0000000000aa'
-- org-domain (country) badge tests
\set za    '00000000-0000-0000-0000-0000000000f1'
\set ke    '00000000-0000-0000-0000-0000000000f2'
\set subk  '00000000-0000-0000-0000-0000000000f3'
\set fake  '00000000-0000-0000-0000-0000000000f4'

-- ---- Fixtures (as the setup role; inserting into auth.users fires handle_new_user) ----
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'alice', 'authenticated', 'authenticated', 'alice@example.org', '{}', '{"name":"Alice"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'bob',   'authenticated', 'authenticated', 'bob@example.org',   '{}', '{"name":"Bob"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'carol', 'authenticated', 'authenticated', 'carol@example.org', '{}', '{"name":"Carol"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'dave',  'authenticated', 'authenticated', 'dave@example.org',  '{}', '{"name":"Dave"}',  now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'moder', 'authenticated', 'authenticated', 'mod@example.org',   '{}', '{"name":"Mod"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'orgu',  'authenticated', 'authenticated', 'lead@wwf.org',      '{}', '{"name":"Org"}',   now(), now()),
  -- prefill fixtures: pat has a LinkedIn picture; quinn+rob already have manual values
  ('00000000-0000-0000-0000-000000000000', :'pat',   'authenticated', 'authenticated', 'pat@example.org',   '{}', '{"name":"Pat","picture":"https://cdn.example/pat.jpg"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'quinn', 'authenticated', 'authenticated', 'quinn@example.org', '{}', '{"name":"Quinn","picture":"https://cdn.example/quinn.jpg"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'rob',   'authenticated', 'authenticated', 'rob@example.org',   '{}', '{"name":"Rob LinkedIn"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'sam',   'authenticated', 'authenticated', 'sam@example.org',   '{}', '{"name":"Sam"}',   now(), now()),
  -- org-domain badge fixtures: national domains + a sub-domain + a lookalike
  ('00000000-0000-0000-0000-000000000000', :'za',    'authenticated', 'authenticated', 'lead@wwf.org.za',           '{}', '{"name":"ZA"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'ke',    'authenticated', 'authenticated', 'lead@wwf.or.ke',            '{}', '{"name":"KE"}',   now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'subk',  'authenticated', 'authenticated', 'officer@nairobi.wwf.or.ke', '{}', '{"name":"SubKE"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'fake',  'authenticated', 'authenticated', 'hacker@wwf-fake.org',       '{}', '{"name":"Fake"}', now(), now());

-- Simulate prior manual edits (name/photo_url are not protected columns, so no bypass needed).
update public.users set photo_url = 'https://custom.example/quinn.jpg' where id = :'quinn';
update public.users set name = 'Rob Manual' where id = :'rob';

insert into public.events (id, name, status) values
  (:'e1', 'COP-Test-1', 'active'),
  (:'e2', 'COP-Test-2', 'active');

insert into public.event_attendees (user_id, event_id) values
  (:'alice', :'e1'), (:'bob', :'e1'), (:'carol', :'e1'), (:'sam', :'e1'),
  (:'dave', :'e2');

-- alice shares a (coarse) location so the location-privacy test has something to hide.
insert into public.user_locations (user_id, event_id, zone_label, approx_area, sharing_expires_at)
  values (:'alice', :'e1', 'Blue Zone', 'u4pru', now() + interval '1 hour');

insert into public.sponsors (event_id, name, is_active, weight) values
  (:'e1', 'Active Sponsor', true, 1),
  (:'e1', 'Hidden Sponsor', false, 1),
  (:'e2', 'Other-Event Sponsor', true, 1);

-- Make mod staff and ban carol (bypass the column lock as the trusted setup path).
select set_config('app.bypass_user_lock', 'on', true);
update public.users set is_staff = true  where id = :'moder';
update public.users set is_banned = true where id = :'carol';
select set_config('app.bypass_user_lock', 'off', true);

-- Switch to the RLS-respecting role for the assertions.
set local role authenticated;

-- =====================================================================
-- Acting as ALICE
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);

select is((select count(*) from public.users where id = :'alice')::int, 1,
  'alice can see her own profile');
select is((select count(*) from public.users where id = :'bob')::int, 1,
  'alice can see co-attendee bob');
select is((select count(*) from public.users where id = :'dave')::int, 0,
  'alice cannot see dave (different event)');
select is((select count(*) from public.users where id = :'carol')::int, 0,
  'alice cannot see banned carol');

select is((select count(*) from public.suggested_matches(:'e1') where user_id = :'bob')::int, 1,
  'matches for alice include co-attendee bob');
select is((select count(*) from public.suggested_matches(:'e1') where user_id = :'carol')::int, 0,
  'matches exclude banned carol');
select is((select count(*) from public.suggested_matches(:'e2'))::int, 0,
  'H1: alice gets no matches for an event she has not joined');

select lives_ok($$ select * from public.event_attendees $$,
  'H2: reading event_attendees does not trigger infinite recursion');

select is((select count(*) from public.sponsors where event_id = :'e1')::int, 1,
  'alice sees only the active sponsor for her event');
select is((select count(*) from public.sponsors where event_id = :'e2')::int, 0,
  'alice sees no sponsors for an event she has not joined');

-- M1: privileged columns cannot be self-assigned via UPDATE.
update public.users set verification_level = 'manual' where id = :'alice';
select is((select verification_level from public.users where id = :'alice')::text, 'email',
  'M1: alice cannot self-escalate her verification_level');

update public.users set is_staff = true where id = :'alice';
select is((select is_staff from public.users where id = :'alice'), false,
  'M1: alice cannot self-grant staff');

-- LinkedIn verification raises the badge.
select mark_linkedin_verified();
select is((select verification_level from public.users where id = :'alice')::text, 'linkedin',
  'mark_linkedin_verified raises alice to linkedin');

-- alice files a report about bob (used by the staff-read test below).
insert into public.reports (reporter_id, reported_user_id, reason)
values (:'alice', :'bob', 'test report');

-- =====================================================================
-- Acting as BOB — connection creation requires a shared event
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);

select lives_ok(
  format($$ insert into public.connections (requester_id, recipient_id, status) values (%L, %L, 'pending') $$, :'bob', :'alice'),
  'bob can request a connection to a co-attendee');
-- 2-arg throws_ok: 2nd arg is the SQLSTATE (42501 = RLS violation). Avoid the
-- 3-arg form, whose 3rd arg is an exact error-message match, not a description.
select throws_ok(
  format($$ insert into public.connections (requester_id, recipient_id, status) values (%L, %L, 'pending') $$, :'bob', :'dave'),
  '42501');

select is((select count(*) from public.reports)::int, 0,
  'non-staff bob cannot read reports');

-- =====================================================================
-- Acting as ORG user — LinkedIn must not downgrade a stronger badge
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'orgu', 'role', 'authenticated')::text, true);
select mark_linkedin_verified();
select is((select verification_level from public.users where id = :'orgu')::text, 'org_domain',
  'mark_linkedin_verified does not downgrade an org_domain badge');

-- =====================================================================
-- Acting as MOD (staff)
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'moder', 'role', 'authenticated')::text, true);

select is((select count(*) from public.reports)::int, 1,
  'staff can read reports');
select is((select count(*) from public.users where id = :'carol')::int, 1,
  'staff can see a banned user');

update public.users set is_banned = false where id = :'carol';
select is((select is_banned from public.users where id = :'carol'), false,
  'staff can unban a user');

-- =====================================================================
-- LinkedIn profile prefill (name + photo from OIDC claims)
-- =====================================================================
-- pat: empty photo gets filled from the LinkedIn picture claim
select set_config('request.jwt.claims', json_build_object('sub', :'pat', 'role', 'authenticated')::text, true);
select mark_linkedin_verified();
select is((select photo_url from public.users where id = :'pat'), 'https://cdn.example/pat.jpg',
  'prefill: empty photo_url is filled from the LinkedIn picture');

-- quinn: an existing manual photo is NOT overwritten
select set_config('request.jwt.claims', json_build_object('sub', :'quinn', 'role', 'authenticated')::text, true);
select mark_linkedin_verified();
select is((select photo_url from public.users where id = :'quinn'), 'https://custom.example/quinn.jpg',
  'prefill: a manual photo_url is not clobbered');

-- rob: an existing manual name is NOT overwritten
select set_config('request.jwt.claims', json_build_object('sub', :'rob', 'role', 'authenticated')::text, true);
select mark_linkedin_verified();
select is((select name from public.users where id = :'rob'), 'Rob Manual',
  'prefill: a manual name is not clobbered');

-- =====================================================================
-- "Met in person" markers
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);

select lives_ok(
  format($$ insert into public.met_contacts (user_id, contact_id) values (%L, %L) $$, :'alice', :'bob'),
  'alice can mark a co-attendee as met');
select throws_ok(
  format($$ insert into public.met_contacts (user_id, contact_id) values (%L, %L) $$, :'alice', :'dave'),
  '42501');
select is((select count(*) from public.met_contacts)::int, 1,
  'alice sees her own met marker');

-- markers are private: bob cannot see alice's
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
select is((select count(*) from public.met_contacts)::int, 0,
  'met markers are private to the owner');

-- =====================================================================
-- Per-contact privacy: hide me / hide my location
-- =====================================================================
-- Baseline: bob can see alice and gets her as a match.
select is((select count(*) from public.users where id = :'alice')::int, 1,
  'baseline: bob can see alice');
select is((select count(*) from public.suggested_matches(:'e1') where user_id = :'alice')::int, 1,
  'baseline: alice appears in bob''s matches');

-- alice hides herself from bob.
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ insert into public.contact_privacy (owner_id, contact_id, hidden) values (%L, %L, true) $$, :'alice', :'bob'),
  'alice can set per-contact privacy (hide) for a co-attendee');

-- Now bob can neither see alice nor match with her.
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
select is((select count(*) from public.users where id = :'alice')::int, 0,
  'privacy: bob cannot see alice after she hides from him');
select is((select count(*) from public.suggested_matches(:'e1') where user_id = :'alice')::int, 0,
  'privacy: alice is excluded from bob''s matches after hiding');

-- Location hiding uses a separate viewer (sam), independent of the hide above.
select set_config('request.jwt.claims', json_build_object('sub', :'sam', 'role', 'authenticated')::text, true);
select is((select count(*) from public.user_locations where user_id = :'alice')::int, 1,
  'baseline: sam can see alice''s shared location');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
insert into public.contact_privacy (owner_id, contact_id, hide_location) values (:'alice', :'sam', true);

select set_config('request.jwt.claims', json_build_object('sub', :'sam', 'role', 'authenticated')::text, true);
select is((select count(*) from public.user_locations where user_id = :'alice')::int, 0,
  'privacy: sam cannot see alice''s location after she hides it from him');

-- =====================================================================
-- Private notes are owner-only
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ insert into public.contact_notes (owner_id, contact_id, note, rating) values (%L, %L, 'good chat', 5) $$, :'alice', :'sam'),
  'alice can write a private note about a co-attendee');

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
select is((select count(*) from public.contact_notes)::int, 0,
  'notes are private: bob cannot read alice''s notes');

-- =====================================================================
-- Org-domain badge across country-specific domains (read as staff)
-- =====================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'moder', 'role', 'authenticated')::text, true);
select is((select verification_level from public.users where id = :'za')::text, 'org_domain',
  'org badge: wwf.org.za (South Africa) is verified');
select is((select verification_level from public.users where id = :'ke')::text, 'org_domain',
  'org badge: wwf.or.ke (Kenya) is verified');
select is((select verification_level from public.users where id = :'subk')::text, 'org_domain',
  'org badge: a sub-domain of wwf.or.ke is verified');
select is((select verification_level from public.users where id = :'fake')::text, 'email',
  'org badge: a lookalike domain (wwf-fake.org) is NOT verified');

-- =====================================================================
-- Swipe-deck feature: interests read policy, connection_status 'passed',
-- and suggested_matches now excluding ANY existing connection (not just
-- 'blocked') so the deck doesn't repeat people already swiped on.
-- =====================================================================

-- Fixture: a single interest row (interests aren't part of the schema
-- migration's seed data, so we insert one here to test the read policy).
insert into public.interests (id, label, category) values (9001, 'Test Interest', 'Test');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
select is((select count(*) from public.interests where id = 9001)::int, 1,
  'interests: authenticated users can read the interests table');

-- connection_status 'passed' is a valid enum value and can be inserted
-- (bob and carol both attend e1, satisfying the shares_event_with check).
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ insert into public.connections (requester_id, recipient_id, status) values (%L, %L, 'passed') $$, :'bob', :'carol'),
  'connections: passed is a valid connection_status value'
);

-- suggested_matches: bob<->alice already have a 'pending' connection from
-- an earlier test in this file. Under the OLD exclusion logic (only
-- 'blocked' was excluded), bob would still appear in alice's matches.
-- Under the NEW logic (any existing connection excludes), he should not.
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
select is((select count(*) from public.suggested_matches(:'e1') where user_id = :'bob')::int, 0,
  'suggested_matches: excludes candidates with ANY existing connection, not just blocked (pending)');

-- Same check for the 'passed' status specifically, using the bob->carol
-- connection created above.
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
select is((select count(*) from public.suggested_matches(:'e1') where user_id = :'carol')::int, 0,
  'suggested_matches: a passed connection also excludes the candidate from future results');

-- avatars storage bucket exists and is public (photo upload feature).
reset role;
select is((select public from storage.buckets where id = 'avatars'), true,
  'storage: avatars bucket exists and is public');
set local role authenticated;

select * from finish();
rollback;
