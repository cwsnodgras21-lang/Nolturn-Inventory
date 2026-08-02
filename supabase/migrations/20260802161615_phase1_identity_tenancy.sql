-- Phase 1: identity, tenancy, roles, locations, audit foundation
-- Ordered for clean `supabase db reset`.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (not the tenant boundary)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  timezone text not null default 'America/Chicago',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_slug_unique unique (slug)
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

comment on column public.organizations.slug is
  'Lowercase kebab-case unique slug. Normalize with lower(trim) and non-alnum -> hyphen.';

-- Soft-delete only: status = archived. No casual hard delete.

-- ---------------------------------------------------------------------------
-- organization_memberships
-- ---------------------------------------------------------------------------

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'revoked')),
  location_access_mode text not null default 'all'
    check (location_access_mode in ('all', 'restricted')),
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_memberships_org_user_unique unique (organization_id, user_id)
);

create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id);

create index organization_memberships_org_status_idx
  on public.organization_memberships (organization_id, status);

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

comment on column public.organization_memberships.location_access_mode is
  'all = organization-wide location access; restricted = only membership_location_scopes rows.';

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  code text,
  timezone text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint locations_code_org_unique unique (organization_id, code)
);

create index locations_organization_id_idx on public.locations (organization_id);

create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

create or replace function private.prevent_location_org_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'locations.organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger locations_prevent_org_move
before update on public.locations
for each row execute function private.prevent_location_org_move();

-- ---------------------------------------------------------------------------
-- permissions (global reference data)
-- ---------------------------------------------------------------------------

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint permissions_key_format check (key ~ '^[a-z]+\.[a-z_]+$')
);

insert into public.permissions (key, name, description, category) values
  ('organization.read', 'Read organization', 'View organization profile and status', 'organization'),
  ('organization.manage', 'Manage organization', 'Update organization settings and profile', 'organization'),
  ('members.read', 'Read members', 'View organization memberships', 'members'),
  ('members.manage', 'Manage members', 'Invite, update, and revoke memberships', 'members'),
  ('roles.read', 'Read roles', 'View roles and permission assignments', 'roles'),
  ('roles.manage', 'Manage roles', 'Assign and remove membership roles', 'roles'),
  ('locations.read', 'Read locations', 'View locations', 'locations'),
  ('locations.manage', 'Manage locations', 'Create and update locations', 'locations'),
  ('audit.read', 'Read audit log', 'View organization audit events', 'audit'),
  ('settings.read', 'Read settings', 'View organization settings', 'settings'),
  ('settings.manage', 'Manage settings', 'Update organization settings', 'settings');

-- ---------------------------------------------------------------------------
-- roles (organization-scoped)
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint roles_org_key_unique unique (organization_id, key),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

create index roles_organization_id_idx on public.roles (organization_id);

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- membership_roles
-- ---------------------------------------------------------------------------

create table public.membership_roles (
  membership_id uuid not null references public.organization_memberships (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (membership_id, role_id)
);

create or replace function private.enforce_membership_role_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  membership_org uuid;
  role_org uuid;
begin
  select organization_id into membership_org
  from public.organization_memberships
  where id = new.membership_id;

  select organization_id into role_org
  from public.roles
  where id = new.role_id;

  if membership_org is null or role_org is null or membership_org <> role_org then
    raise exception 'membership_roles must reference membership and role in the same organization';
  end if;

  return new;
end;
$$;

create trigger membership_roles_same_org
before insert or update on public.membership_roles
for each row execute function private.enforce_membership_role_same_org();

-- ---------------------------------------------------------------------------
-- membership_location_scopes
-- ---------------------------------------------------------------------------

create table public.membership_location_scopes (
  membership_id uuid not null references public.organization_memberships (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (membership_id, location_id)
);

create or replace function private.enforce_membership_location_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  membership_org uuid;
  location_org uuid;
begin
  select organization_id into membership_org
  from public.organization_memberships
  where id = new.membership_id;

  select organization_id into location_org
  from public.locations
  where id = new.location_id;

  if membership_org is null or location_org is null or membership_org <> location_org then
    raise exception 'membership_location_scopes must reference membership and location in the same organization';
  end if;

  return new;
end;
$$;

create trigger membership_location_scopes_same_org
before insert or update on public.membership_location_scopes
for each row execute function private.enforce_membership_location_same_org();

-- ---------------------------------------------------------------------------
-- audit_events (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_type text not null default 'user'
    check (actor_type in ('user', 'system', 'service')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_events_organization_id_created_at_idx
  on public.audit_events (organization_id, created_at desc);

create index audit_events_action_idx on public.audit_events (action);

comment on table public.audit_events is
  'Append-only application audit log. Updates and deletes are denied by RLS and revoke.';

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update on public.organization_memberships to authenticated;
grant select, insert, update on public.locations to authenticated;
grant select on public.permissions to authenticated, anon;
grant select on public.roles to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, insert, delete on public.membership_roles to authenticated;
grant select, insert, delete on public.membership_location_scopes to authenticated;
grant select, insert on public.audit_events to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
