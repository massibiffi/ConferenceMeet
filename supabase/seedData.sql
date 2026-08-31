-- Seed 4 fake test users for COP31, with varied roles, orgs, and interests
-- so the swipe deck has something realistic to test against.

do $$
declare
  v_event_id uuid := '288f881d-58e2-44a4-a462-7eda92949b26';
  v_user_id uuid;
begin

  -- 1. Amara Okafor — NGO, climate finance
  v_user_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    'amara.okafor.test@example.com', crypt('testpassword123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', false,
    '', '', '', ''
  );
  update public.users set
    name = 'Amara Okafor',
    headline = 'Climate finance lead pushing for fair loss & damage funding',
    org = 'Africa Climate Finance Hub',
    role = 'ngo',
    bio = 'Working on unlocking climate finance for vulnerable nations.',
    intent_text = 'Looking to connect with funders and policy folks on loss & damage mechanisms.'
  where id = v_user_id;
  insert into public.event_attendees (user_id, event_id) values (v_user_id, v_event_id);
  insert into public.user_interests (user_id, interest_id)
    values (v_user_id, 1), (v_user_id, 4), (v_user_id, 13); -- Climate finance, Loss & damage, Carbon markets

  -- 2. Diego Fernández — journalist, climate media
  v_user_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    'diego.fernandez.test@example.com', crypt('testpassword123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', false,
    '', '', '', ''
  );
  update public.users set
    name = 'Diego Fernández',
    headline = 'Investigative journalist covering climate policy failures',
    org = 'Independent',
    role = 'journalist',
    bio = 'Ten years reporting on environmental policy across Latin America.',
    intent_text = 'Looking for sources and story leads on deforestation and Indigenous rights.'
  where id = v_user_id;
  insert into public.event_attendees (user_id, event_id) values (v_user_id, v_event_id);
  insert into public.user_interests (user_id, interest_id)
    values (v_user_id, 18), (v_user_id, 8), (v_user_id, 9); -- Climate journalism, Deforestation, Indigenous rights

  -- 3. Priya Ramanathan — researcher, adaptation & resilience
  v_user_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    'priya.ramanathan.test@example.com', crypt('testpassword123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', false,
    '', '', '', ''
  );
  update public.users set
    name = 'Priya Ramanathan',
    headline = 'Climate adaptation researcher focused on coastal resilience',
    org = 'Global Resilience Institute',
    role = 'researcher',
    bio = 'PhD in environmental engineering, 8 years studying coastal adaptation.',
    intent_text = 'Seeking collaborators on water security and adaptation modeling.'
  where id = v_user_id;
  insert into public.event_attendees (user_id, event_id) values (v_user_id, v_event_id);
  insert into public.user_interests (user_id, interest_id)
    values (v_user_id, 5), (v_user_id, 7), (v_user_id, 16); -- Adaptation & resilience, Ocean & coasts, Water security

  -- 4. Kwame Boateng — grassroots activist, youth organizing
  v_user_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    'kwame.boateng.test@example.com', crypt('testpassword123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}', false,
    '', '', '', ''
  );
  update public.users set
    name = 'Kwame Boateng',
    headline = 'Youth climate organizer building grassroots movements',
    org = 'Youth Climate Action Network',
    role = 'youth_delegate',
    bio = 'Organizing young people across West Africa for climate justice.',
    intent_text = 'Want to connect with funders and other youth-led organizations.'
  where id = v_user_id;
  insert into public.event_attendees (user_id, event_id) values (v_user_id, v_event_id);
  insert into public.user_interests (user_id, interest_id)
    values (v_user_id, 10), (v_user_id, 20), (v_user_id, 11); -- Youth & education, Grassroots organising, Gender & climate

update public.users set photo_url = 'https://randomuser.me/api/portraits/women/44.jpg'
where name = 'Amara Okafor';

update public.users set photo_url = 'https://randomuser.me/api/portraits/men/32.jpg'
where name = 'Diego Fernández';

update public.users set photo_url = 'https://randomuser.me/api/portraits/women/68.jpg'
where name = 'Priya Ramanathan';

update public.users set photo_url = 'https://randomuser.me/api/portraits/men/76.jpg'
where name = 'Kwame Boateng';

end $$;

delete from connections
where requester_id = 'b555fd2a-43d7-4569-b777-b9decbc0473f'
  and recipient_id in (
    select id from users
    where name in ('Amara Okafor', 'Diego Fernández', 'Priya Ramanathan', 'Kwame Boateng')
  );

  insert into public.events (name, location, start_date, end_date, description)
  values ('COP31', 'Antalya, Türkiye', '2026-11-09', '2026-11-20',
          'Pilot event for civil-society networking.');