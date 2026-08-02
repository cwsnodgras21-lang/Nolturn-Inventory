-- Productization 1: customer onboarding — branding, status, invites, modules, storage

-- ---------------------------------------------------------------------------
-- Organization branding / locale
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists display_name text,
  add column if not exists logo_path text,
  add column if not exists date_format text not null default 'MM/dd/yyyy'
    check (date_format in ('MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd')),
  add column if not exists currency_code text not null default 'USD'
    check (currency_code ~ '^[A-Z]{3}$'),
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_address text;

update public.organizations
set display_name = name
where display_name is null;

alter table public.organizations
  alter column display_name set default null;

comment on column public.organizations.display_name is
  'Customer-facing display name; falls back to name in UI when null.';
comment on column public.organizations.logo_path is
  'Private storage object path within org-logos bucket (organization_id/...).';

-- ---------------------------------------------------------------------------
-- Onboarding state
-- ---------------------------------------------------------------------------

create table public.organization_onboarding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('not_started', 'in_progress', 'completed')),
  current_step text not null default 'details'
    check (
      current_step in (
        'details',
        'location',
        'invite',
        'starter',
        'catalog',
        'modules',
        'review'
      )
    ),
  starter_pack text
    check (starter_pack is null or starter_pack in ('blank', 'clinic', 'dental', 'medspa')),
  demo_data_enabled boolean not null default false,
  details_completed_at timestamptz,
  location_completed_at timestamptz,
  invite_completed_at timestamptz,
  invite_skipped boolean not null default false,
  starter_completed_at timestamptz,
  catalog_completed_at timestamptz,
  catalog_skipped boolean not null default false,
  modules_completed_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_onboarding_completed_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint organization_onboarding_required_steps_before_complete check (
    status <> 'completed'
    or (
      details_completed_at is not null
      and location_completed_at is not null
      and starter_completed_at is not null
      and modules_completed_at is not null
    )
  )
);

create trigger organization_onboarding_set_updated_at
before update on public.organization_onboarding
for each row execute function public.set_updated_at();

comment on table public.organization_onboarding is
  'Guided setup progress for a tenant. Optional steps may be skipped; required steps must complete before finish.';

-- ---------------------------------------------------------------------------
-- Module registry (configuration / entitlement groundwork)
-- ---------------------------------------------------------------------------

create table public.module_definitions (
  id text primary key,
  name text not null,
  description text,
  version text not null default '1.0.0',
  dependencies text[] not null default '{}',
  is_core boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.module_definitions (id, name, description, version, dependencies, is_core, sort_order)
values
  ('core.inventory', 'Core Inventory', 'Catalog, storage, ledger, movements, and counts', '1.0.0', '{}', true, 10),
  ('core.purchasing', 'Purchasing', 'Suppliers, purchase orders, and receiving', '1.0.0', '{core.inventory}', false, 20),
  ('core.lots', 'Lots and Expiration', 'Lot tracking and expiration views', '1.0.0', '{core.inventory}', false, 30),
  ('core.recalls', 'Recalls', 'Recall records and quarantine workflows', '1.0.0', '{core.inventory,core.lots}', false, 40),
  ('core.reorder', 'Reorder Planning', 'Reorder rules and restock planning', '1.0.0', '{core.inventory}', false, 50),
  ('core.alerts', 'Alerts', 'Operational alert conditions and workspace', '1.0.0', '{core.inventory}', false, 60)
on conflict (id) do nothing;

create table public.organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module_id text not null references public.module_definitions (id) on delete restrict,
  status text not null default 'enabled'
    check (status in ('enabled', 'disabled')),
  enabled_at timestamptz,
  enabled_by uuid references auth.users (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_modules_org_module_unique unique (organization_id, module_id)
);

create index organization_modules_org_status_idx
  on public.organization_modules (organization_id, status);

create trigger organization_modules_set_updated_at
before update on public.organization_modules
for each row execute function public.set_updated_at();

comment on table public.organization_modules is
  'Per-tenant module enablement. Entitlement/billing enforcement is deferred.';

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  role_id uuid not null references public.roles (id) on delete restrict,
  location_access_mode text not null default 'all'
    check (location_access_mode in ('all', 'restricted')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_invitations_email_format check (char_length(trim(email)) > 3)
);

create unique index organization_invitations_pending_email_uidx
  on public.organization_invitations (organization_id, email_normalized)
  where status = 'pending';

create unique index organization_invitations_token_hash_uidx
  on public.organization_invitations (token_hash);

create index organization_invitations_org_status_idx
  on public.organization_invitations (organization_id, status);

create trigger organization_invitations_set_updated_at
before update on public.organization_invitations
for each row execute function public.set_updated_at();

create table public.organization_invitation_location_scopes (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.organization_invitations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint organization_invitation_location_scopes_unique unique (invitation_id, location_id)
);

create index organization_invitation_location_scopes_inv_idx
  on public.organization_invitation_location_scopes (invitation_id);

create or replace function private.organization_invitation_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inv_org uuid;
  v_role_org uuid;
  v_loc_org uuid;
begin
  if tg_table_name = 'organization_invitations' then
    select r.organization_id into v_role_org from public.roles r where r.id = new.role_id;
    if v_role_org is distinct from new.organization_id then
      raise exception 'invitation role must belong to the same organization';
    end if;
  end if;

  if tg_table_name = 'organization_invitation_location_scopes' then
    select i.organization_id into v_inv_org
    from public.organization_invitations i where i.id = new.invitation_id;
    select l.organization_id into v_loc_org
    from public.locations l where l.id = new.location_id;
    if v_inv_org is distinct from new.organization_id
       or v_loc_org is distinct from new.organization_id then
      raise exception 'invitation location scope must stay within the invitation organization';
    end if;
  end if;

  return new;
end;
$$;

create trigger organization_invitations_same_org
before insert or update on public.organization_invitations
for each row execute function private.organization_invitation_same_org();

create trigger organization_invitation_location_scopes_same_org
before insert or update on public.organization_invitation_location_scopes
for each row execute function private.organization_invitation_same_org();

-- ---------------------------------------------------------------------------
-- CSV import batches (audit / dry-run trail; items still go through catalog tables)
-- ---------------------------------------------------------------------------

create table public.catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'committed', 'failed', 'cancelled')),
  mode text not null default 'all_or_nothing'
    check (mode = 'all_or_nothing'),
  file_name text,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  error_count integer not null default 0,
  committed_count integer not null default 0,
  preview jsonb not null default '[]'::jsonb,
  error_summary jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  committed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index catalog_import_batches_org_idx
  on public.catalog_import_batches (organization_id, created_at desc);

create trigger catalog_import_batches_set_updated_at
before update on public.catalog_import_batches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organization_onboarding enable row level security;
alter table public.organization_onboarding force row level security;
alter table public.module_definitions enable row level security;
alter table public.module_definitions force row level security;
alter table public.organization_modules enable row level security;
alter table public.organization_modules force row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_invitations force row level security;
alter table public.organization_invitation_location_scopes enable row level security;
alter table public.organization_invitation_location_scopes force row level security;
alter table public.catalog_import_batches enable row level security;
alter table public.catalog_import_batches force row level security;

revoke all on table public.organization_onboarding from public, anon;
revoke all on table public.module_definitions from public, anon;
revoke all on table public.organization_modules from public, anon;
revoke all on table public.organization_invitations from public, anon;
revoke all on table public.organization_invitation_location_scopes from public, anon;
revoke all on table public.catalog_import_batches from public, anon;

grant select, insert, update on table public.organization_onboarding to authenticated;
grant select on table public.module_definitions to authenticated;
grant select, insert, update on table public.organization_modules to authenticated;
grant select, insert, update on table public.organization_invitations to authenticated;
grant select, insert, delete on table public.organization_invitation_location_scopes to authenticated;
grant select, insert, update on table public.catalog_import_batches to authenticated;

grant all on table public.organization_onboarding to service_role;
grant all on table public.module_definitions to service_role;
grant all on table public.organization_modules to service_role;
grant all on table public.organization_invitations to service_role;
grant all on table public.organization_invitation_location_scopes to service_role;
grant all on table public.catalog_import_batches to service_role;

create policy organization_onboarding_select on public.organization_onboarding
for select to authenticated
using (private.user_has_permission(organization_id, 'organization.read'));

create policy organization_onboarding_insert on public.organization_onboarding
for insert to authenticated
with check (private.user_has_permission(organization_id, 'organization.manage'));

create policy organization_onboarding_update on public.organization_onboarding
for update to authenticated
using (private.user_has_permission(organization_id, 'organization.manage'))
with check (private.user_has_permission(organization_id, 'organization.manage'));

create policy module_definitions_select on public.module_definitions
for select to authenticated
using (true);

create policy organization_modules_select on public.organization_modules
for select to authenticated
using (private.user_has_permission(organization_id, 'organization.read'));

create policy organization_modules_insert on public.organization_modules
for insert to authenticated
with check (private.user_has_permission(organization_id, 'organization.manage'));

create policy organization_modules_update on public.organization_modules
for update to authenticated
using (private.user_has_permission(organization_id, 'organization.manage'))
with check (private.user_has_permission(organization_id, 'organization.manage'));

create policy organization_invitations_select on public.organization_invitations
for select to authenticated
using (private.user_has_permission(organization_id, 'members.read'));

create policy organization_invitations_insert on public.organization_invitations
for insert to authenticated
with check (private.user_has_permission(organization_id, 'members.manage'));

create policy organization_invitations_update on public.organization_invitations
for update to authenticated
using (private.user_has_permission(organization_id, 'members.manage'))
with check (private.user_has_permission(organization_id, 'members.manage'));

create policy organization_invitation_scopes_select on public.organization_invitation_location_scopes
for select to authenticated
using (private.user_has_permission(organization_id, 'members.read'));

create policy organization_invitation_scopes_insert on public.organization_invitation_location_scopes
for insert to authenticated
with check (private.user_has_permission(organization_id, 'members.manage'));

create policy organization_invitation_scopes_delete on public.organization_invitation_location_scopes
for delete to authenticated
using (private.user_has_permission(organization_id, 'members.manage'));

create policy catalog_import_batches_select on public.catalog_import_batches
for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy catalog_import_batches_insert on public.catalog_import_batches
for insert to authenticated
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy catalog_import_batches_update on public.catalog_import_batches
for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));

-- ---------------------------------------------------------------------------
-- Invitation accept / revoke helpers (SECURITY DEFINER; no service role in app)
-- ---------------------------------------------------------------------------

create or replace function public.accept_organization_invitation(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_inv public.organization_invitations%rowtype;
  v_membership_id uuid;
  v_hash text;
  v_scope record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'Invalid invitation token';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user_id;
  if v_email is null then
    raise exception 'Authenticated user email is required';
  end if;

  v_hash := encode(extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');

  select * into v_inv
  from public.organization_invitations i
  where i.token_hash = v_hash
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'Invitation has been revoked';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Invitation already accepted';
  end if;

  if v_inv.expires_at <= timezone('utc', now()) then
    update public.organization_invitations
    set status = 'expired', updated_at = timezone('utc', now())
    where id = v_inv.id and status = 'pending';
    raise exception 'Invitation has expired';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Invitation is not pending';
  end if;

  if lower(trim(v_inv.email)) <> lower(trim(v_email)) then
    raise exception 'Invitation email does not match the signed-in user';
  end if;

  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_inv.organization_id
      and m.user_id = v_user_id
      and m.status = 'active'
  ) then
    raise exception 'User is already an active member of this organization';
  end if;

  insert into public.organization_memberships (
    organization_id, user_id, status, location_access_mode, invited_at, joined_at
  ) values (
    v_inv.organization_id,
    v_user_id,
    'active',
    v_inv.location_access_mode,
    v_inv.created_at,
    timezone('utc', now())
  )
  on conflict (organization_id, user_id) do update
    set status = 'active',
        location_access_mode = excluded.location_access_mode,
        joined_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
  returning id into v_membership_id;

  delete from public.membership_roles where membership_id = v_membership_id;
  insert into public.membership_roles (membership_id, role_id)
  values (v_membership_id, v_inv.role_id);

  delete from public.membership_location_scopes where membership_id = v_membership_id;
  if v_inv.location_access_mode = 'restricted' then
    for v_scope in
      select s.location_id
      from public.organization_invitation_location_scopes s
      where s.invitation_id = v_inv.id
    loop
      insert into public.membership_location_scopes (membership_id, location_id)
      values (v_membership_id, v_scope.location_id);
    end loop;
  end if;

  update public.organization_invitations
  set status = 'accepted',
      accepted_at = timezone('utc', now()),
      accepted_user_id = v_user_id,
      updated_at = timezone('utc', now())
  where id = v_inv.id;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata
  ) values (
    v_inv.organization_id, v_user_id, 'user', 'membership.invitation_accepted',
    'organization_invitation', v_inv.id,
    'Invitation accepted',
    jsonb_build_object('email', v_inv.email, 'membership_id', v_membership_id)
  );

  return v_inv.organization_id;
end;
$$;

revoke all on function public.accept_organization_invitation(text) from public;
grant execute on function public.accept_organization_invitation(text) to authenticated;

create or replace function public.revoke_organization_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inv public.organization_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_inv
  from public.organization_invitations i
  where i.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if not private.user_has_permission(v_inv.organization_id, 'members.manage') then
    raise exception 'Permission denied';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Only pending invitations can be revoked';
  end if;

  update public.organization_invitations
  set status = 'revoked',
      revoked_at = timezone('utc', now()),
      revoked_by = v_user_id,
      updated_at = timezone('utc', now())
  where id = v_inv.id;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata
  ) values (
    v_inv.organization_id, v_user_id, 'user', 'membership.invitation_revoked',
    'organization_invitation', v_inv.id,
    'Invitation revoked',
    jsonb_build_object('email', v_inv.email)
  );
end;
$$;

revoke all on function public.revoke_organization_invitation(uuid) from public;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private helpers for provisioning
-- ---------------------------------------------------------------------------

create or replace function private.initialize_organization_onboarding(
  p_organization_id uuid,
  p_mark_completed boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  insert into public.organization_onboarding (
    organization_id,
    status,
    current_step,
    details_completed_at,
    location_completed_at,
    invite_skipped,
    starter_completed_at,
    catalog_skipped,
    modules_completed_at,
    completed_at,
    starter_pack
  ) values (
    p_organization_id,
    case when p_mark_completed then 'completed' else 'in_progress' end,
    case when p_mark_completed then 'review' else 'details' end,
    case when p_mark_completed then v_now else null end,
    case when p_mark_completed then v_now else null end,
    p_mark_completed,
    case when p_mark_completed then v_now else null end,
    p_mark_completed,
    case when p_mark_completed then v_now else null end,
    case when p_mark_completed then v_now else null end,
    case when p_mark_completed then 'blank' else null end
  )
  on conflict (organization_id) do nothing;

  insert into public.organization_modules (
    organization_id, module_id, status, enabled_at
  )
  select
    p_organization_id,
    d.id,
    'enabled',
    v_now
  from public.module_definitions d
  on conflict (organization_id, module_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update provision_organization to start onboarding + modules
-- ---------------------------------------------------------------------------

create or replace function public.provision_organization(
  p_name text,
  p_timezone text default 'America/Chicago',
  p_create_default_location boolean default true,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_slug_base text;
  v_suffix int := 0;
  v_location_id uuid;
  v_correlation uuid := coalesce(p_correlation_id, gen_random_uuid());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organization name is required';
  end if;

  v_slug_base := private.normalize_org_slug(p_name);
  v_slug := v_slug_base;

  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix::text;
  end loop;

  insert into public.organizations (
    name, display_name, slug, status, timezone, created_by
  ) values (
    trim(p_name),
    trim(p_name),
    v_slug,
    'active',
    coalesce(nullif(trim(p_timezone), ''), 'America/Chicago'),
    v_user_id
  )
  returning id into v_org_id;

  perform private.seed_system_roles(v_org_id);
  perform private.initialize_organization_onboarding(v_org_id, false);

  insert into public.organization_memberships (
    organization_id, user_id, status, location_access_mode, joined_at
  ) values (
    v_org_id, v_user_id, 'active', 'all', timezone('utc', now())
  ) returning id into v_membership_id;

  select r.id into v_owner_role_id
  from public.roles r
  where r.organization_id = v_org_id and r.key = 'organization_owner';

  insert into public.membership_roles (membership_id, role_id)
  values (v_membership_id, v_owner_role_id);

  if p_create_default_location then
    insert into public.locations (organization_id, name, code, timezone, status, country_code)
    values (
      v_org_id,
      'Primary',
      'PRIMARY',
      coalesce(nullif(trim(p_timezone), ''), 'America/Chicago'),
      'active',
      'US'
    )
    returning id into v_location_id;
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata, correlation_id
  ) values (
    v_org_id, v_user_id, 'user', 'organization.created', 'organization', v_org_id,
    'Organization created',
    jsonb_build_object('slug', v_slug, 'default_location_id', v_location_id),
    v_correlation
  );

  insert into public.audit_events (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata, correlation_id
  ) values (
    v_org_id, v_user_id, 'user', 'membership.created', 'organization_membership', v_membership_id,
    'Owner membership created',
    jsonb_build_object('user_id', v_user_id, 'role', 'organization_owner'),
    v_correlation
  );

  insert into public.audit_events (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata, correlation_id
  ) values (
    v_org_id, v_user_id, 'user', 'role.assigned', 'membership_role', v_membership_id,
    'Organization Owner role assigned',
    jsonb_build_object('role_key', 'organization_owner'),
    v_correlation
  );

  if v_location_id is not null then
    insert into public.audit_events (
      organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata, correlation_id
    ) values (
      v_org_id, v_user_id, 'user', 'location.created', 'location', v_location_id,
      'Default location created',
      jsonb_build_object('code', 'PRIMARY'),
      v_correlation
    );
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, summary, metadata, correlation_id
  ) values (
    v_org_id, v_user_id, 'user', 'onboarding.started', 'organization_onboarding', v_org_id,
    'Organization onboarding started',
    jsonb_build_object('current_step', 'details'),
    v_correlation
  );

  return v_org_id;
end;
$$;

revoke all on function public.provision_organization(text, text, boolean, uuid) from public;
grant execute on function public.provision_organization(text, text, boolean, uuid) to authenticated, service_role;

-- Backfill existing organizations as completed (demo / already-running tenants)
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform private.initialize_organization_onboarding(r.id, true);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private logo storage bucket + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-logos',
  'org-logos',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_org_id(object_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

create policy org_logos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'org-logos'
  and private.user_has_permission(private.storage_org_id(name), 'organization.read')
);

create policy org_logos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'org-logos'
  and private.user_has_permission(private.storage_org_id(name), 'organization.manage')
  and private.storage_org_id(name) is not null
);

create policy org_logos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'org-logos'
  and private.user_has_permission(private.storage_org_id(name), 'organization.manage')
)
with check (
  bucket_id = 'org-logos'
  and private.user_has_permission(private.storage_org_id(name), 'organization.manage')
);

create policy org_logos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'org-logos'
  and private.user_has_permission(private.storage_org_id(name), 'organization.manage')
);
