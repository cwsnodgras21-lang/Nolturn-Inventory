-- Phase 3.6: operational alert permissions

insert into public.permissions (key, name, description, category) values
  ('alerts.read', 'Read operational alerts', 'View inventory operational alerts and history', 'alerts'),
  ('alerts.manage', 'Manage operational alerts', 'Sync, acknowledge, and resolve operational alerts', 'alerts')
on conflict (key) do nothing;

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

  insert into public.role_permissions (role_id, permission_id)
  select role_owner, p.id from public.permissions p;
  insert into public.role_permissions (role_id, permission_id)
  select role_admin, p.id from public.permissions p;

  insert into public.role_permissions (role_id, permission_id)
  select role_inventory, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'roles.read',
    'audit.read', 'settings.read', 'catalog.read', 'catalog.manage',
    'inventory.storage.read', 'inventory.storage.manage',
    'inventory.read', 'inventory.adjust',
    'inventory.receive', 'inventory.consume', 'inventory.transfer',
    'inventory.reverse',
    'inventory.count.read', 'inventory.count.perform', 'inventory.count.review',
    'inventory.lots.read', 'inventory.lots.manage',
    'inventory.recalls.read', 'inventory.recalls.manage',
    'inventory.reorder.read', 'inventory.reorder.manage',
    'purchasing.read', 'purchasing.manage', 'purchasing.receive',
    'alerts.read', 'alerts.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select role_purchasing, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'roles.read',
    'audit.read', 'settings.read', 'catalog.read', 'inventory.storage.read',
    'inventory.read', 'inventory.receive',
    'inventory.lots.read', 'inventory.lots.manage',
    'inventory.recalls.read', 'inventory.recalls.manage',
    'inventory.reorder.read', 'inventory.reorder.manage',
    'purchasing.read', 'purchasing.manage', 'purchasing.receive',
    'alerts.read', 'alerts.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select role_location, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'locations.manage',
    'roles.read', 'audit.read', 'settings.read', 'catalog.read',
    'inventory.storage.read', 'inventory.storage.manage',
    'inventory.read', 'inventory.adjust',
    'inventory.receive', 'inventory.consume', 'inventory.transfer',
    'inventory.reverse',
    'inventory.count.read', 'inventory.count.perform', 'inventory.count.review',
    'inventory.lots.read',
    'inventory.recalls.read',
    'inventory.reorder.read',
    'purchasing.read', 'purchasing.receive',
    'alerts.read', 'alerts.manage'
  );

  insert into public.role_permissions (role_id, permission_id)
  select role_staff, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'settings.read',
    'catalog.read', 'inventory.storage.read', 'inventory.read', 'inventory.consume',
    'inventory.count.read', 'inventory.count.perform',
    'inventory.lots.read',
    'inventory.recalls.read',
    'inventory.reorder.read',
    'purchasing.read',
    'alerts.read'
  );

  insert into public.role_permissions (role_id, permission_id)
  select role_readonly, p.id from public.permissions p
  where p.key in (
    'organization.read', 'members.read', 'locations.read', 'roles.read',
    'audit.read', 'settings.read', 'catalog.read', 'inventory.storage.read',
    'inventory.read', 'inventory.count.read',
    'inventory.lots.read',
    'inventory.recalls.read',
    'inventory.reorder.read',
    'purchasing.read',
    'alerts.read'
  );
end;
$$;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system = true
  and r.key in (
    'organization_owner',
    'organization_administrator',
    'inventory_manager',
    'purchasing_manager',
    'location_manager'
  )
  and p.key in ('alerts.read', 'alerts.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system = true
  and r.key in ('staff', 'read_only')
  and p.key = 'alerts.read'
on conflict do nothing;
