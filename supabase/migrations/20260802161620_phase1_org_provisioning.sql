-- Phase 1: transactional organization provisioning
-- Called by authenticated users via RPC. Uses security definer with fixed search_path.
-- Necessary because the creator has no membership yet when the organization is inserted.

create or replace function private.normalize_org_slug(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  slug text;
begin
  slug := lower(trim(p_name));
  slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
  slug := regexp_replace(slug, '^-+|-+$', '', 'g');
  if slug is null or slug = '' then
    slug := 'organization';
  end if;
  return slug;
end;
$$;

create or replace function private.seed_system_roles(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_owner uuid;
  role_admin uuid;
  role_inventory uuid;
  role_purchasing uuid;
  role_location uuid;
  role_staff uuid;
  role_readonly uuid;
begin
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'organization_owner', 'Organization Owner', 'Full organization control', true)
    returning id into role_owner;
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'organization_administrator', 'Organization Administrator', 'Administrative control without ownership transfer concerns', true)
    returning id into role_admin;
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'inventory_manager', 'Inventory Manager', 'Forward-compatible inventory operations role', true)
    returning id into role_inventory;
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'purchasing_manager', 'Purchasing Manager', 'Forward-compatible purchasing operations role', true)
    returning id into role_purchasing;
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'location_manager', 'Location Manager', 'Manage locations within the organization', true)
    returning id into role_location;
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'staff', 'Staff', 'Day-to-day operational access', true)
    returning id into role_staff;
  insert into public.roles (organization_id, key, name, description, is_system) values
    (p_organization_id, 'read_only', 'Read Only', 'Read access without mutation rights', true)
    returning id into role_readonly;

  -- Owner / Admin: all Phase 1 permissions
  insert into public.role_permissions (role_id, permission_id)
  select role_owner, p.id from public.permissions p;
  insert into public.role_permissions (role_id, permission_id)
  select role_admin, p.id from public.permissions p;

  -- Inventory / Purchasing managers: read-focused Phase 1 set
  insert into public.role_permissions (role_id, permission_id)
  select role_inventory, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'roles.read',
    'audit.read', 'settings.read'
  );
  insert into public.role_permissions (role_id, permission_id)
  select role_purchasing, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'roles.read',
    'audit.read', 'settings.read'
  );

  -- Location manager
  insert into public.role_permissions (role_id, permission_id)
  select role_location, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'locations.manage',
    'roles.read', 'audit.read', 'settings.read'
  );

  -- Staff
  insert into public.role_permissions (role_id, permission_id)
  select role_staff, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'settings.read'
  );

  -- Read only
  insert into public.role_permissions (role_id, permission_id)
  select role_readonly, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'roles.read',
    'audit.read', 'settings.read'
  );
end;
$$;

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

  insert into public.organizations (name, slug, status, timezone, created_by)
  values (trim(p_name), v_slug, 'active', coalesce(nullif(trim(p_timezone), ''), 'America/Chicago'), v_user_id)
  returning id into v_org_id;

  perform private.seed_system_roles(v_org_id);

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
    values (v_org_id, 'Primary', 'PRIMARY', coalesce(nullif(trim(p_timezone), ''), 'America/Chicago'), 'active', 'US')
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

  return v_org_id;
end;
$$;

revoke all on function public.provision_organization(text, text, boolean, uuid) from public;
grant execute on function public.provision_organization(text, text, boolean, uuid) to authenticated, service_role;

comment on function public.provision_organization(text, text, boolean, uuid) is
  'Atomically creates an organization, seeds system roles, assigns Organization Owner, optionally creates a Primary location, and writes audit events. Default location is created for operational readiness (product decision).';
