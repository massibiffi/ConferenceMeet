-- Minimal Supabase-compatible shims so the app schema + pgTAP RLS tests can run on a
-- plain Postgres image (i.e. without the full Supabase stack). Used by run.sh.
-- `supabase test db` does NOT need this — it already provides auth + pgTAP.
create extension if not exists pgcrypto;
create extension if not exists pgtap;

-- Supabase roles
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;

-- auth schema + a minimal users table (the app's handle_new_user trigger targets it)
create schema if not exists auth;
create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to public;
grant execute on function auth.role() to public;
