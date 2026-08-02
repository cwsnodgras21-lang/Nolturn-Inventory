-- Phase 1: RLS helpers and policies
-- Security definer helpers live in private schema with fixed search_path.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

create or replace function private.user_has_active_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function private.user_has_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and p.key = p_permission_key
  );
$$;

create or replace function private.user_can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    join public.organization_memberships m
      on m.organization_id = l.organization_id
     and m.user_id = auth.uid()
     and m.status = 'active'
    where l.id = p_location_id
      and (
        m.location_access_mode = 'all'
        or exists (
          select 1
          from public.membership_location_scopes mls
          where mls.membership_id = m.id
            and mls.location_id = l.id
        )
      )
  );
$$;

-- Thin public wrappers for policies / app debugging (do not return tenant rows).
create or replace function public.current_user_has_active_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_active_membership(p_organization_id);
$$;

create or replace function public.current_user_has_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_permission(p_organization_id, p_permission_key);
$$;

create or replace function public.current_user_can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_can_access_location(p_location_id);
$$;

revoke all on function public.current_user_has_active_membership(uuid) from public;
revoke all on function public.current_user_has_permission(uuid, text) from public;
revoke all on function public.current_user_can_access_location(uuid) from public;
grant execute on function public.current_user_has_active_membership(uuid) to authenticated, service_role;
grant execute on function public.current_user_has_permission(uuid, text) to authenticated, service_role;
grant execute on function public.current_user_can_access_location(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.locations enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.membership_location_scopes enable row level security;
alter table public.audit_events enable row level security;

-- Force RLS even for table owners in local/dev.
alter table public.profiles force row level security;
alter table public.organizations force row level security;
alter table public.organization_memberships force row level security;
alter table public.locations force row level security;
alter table public.permissions force row level security;
alter table public.roles force row level security;
alter table public.role_permissions force row level security;
alter table public.membership_roles force row level security;
alter table public.membership_location_scopes force row level security;
alter table public.audit_events force row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_own
on public.profiles for select to authenticated
using (id = auth.uid());

create policy profiles_update_own
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Inserts are created by the auth trigger (security definer). No direct insert policy.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create policy organizations_select_member
on public.organizations for select to authenticated
using (private.user_has_active_membership(id));

-- Inserts go through provision_organization (security definer). No direct insert.

create policy organizations_update_manage
on public.organizations for update to authenticated
using (private.user_has_permission(id, 'organization.manage'))
with check (private.user_has_permission(id, 'organization.manage'));

-- No delete policy — soft archive only via update.

-- ---------------------------------------------------------------------------
-- organization_memberships
-- ---------------------------------------------------------------------------

create policy memberships_select
on public.organization_memberships for select to authenticated
using (
  user_id = auth.uid()
  or private.user_has_permission(organization_id, 'members.read')
);

create policy memberships_insert_manage
on public.organization_memberships for insert to authenticated
with check (private.user_has_permission(organization_id, 'members.manage'));

create policy memberships_update_manage
on public.organization_memberships for update to authenticated
using (private.user_has_permission(organization_id, 'members.manage'))
with check (private.user_has_permission(organization_id, 'members.manage'));

-- No delete — use status = revoked.

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------

create policy locations_select
on public.locations for select to authenticated
using (private.user_can_access_location(id));

create policy locations_insert
on public.locations for insert to authenticated
with check (private.user_has_permission(organization_id, 'locations.manage'));

create policy locations_update
on public.locations for update to authenticated
using (private.user_has_permission(organization_id, 'locations.manage'))
with check (
  private.user_has_permission(organization_id, 'locations.manage')
  and private.user_can_access_location(id)
);

-- ---------------------------------------------------------------------------
-- permissions (global catalog — readable to authenticated)
-- ---------------------------------------------------------------------------

create policy permissions_select_authenticated
on public.permissions for select to authenticated
using (true);

-- No mutations for authenticated users.

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------

create policy roles_select
on public.roles for select to authenticated
using (
  private.user_has_permission(organization_id, 'roles.read')
  or private.user_has_active_membership(organization_id)
);

-- System role rows are seeded by provision_organization. No direct insert/update/delete.

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------

create policy role_permissions_select
on public.role_permissions for select to authenticated
using (
  exists (
    select 1 from public.roles r
    where r.id = role_id
      and (
        private.user_has_permission(r.organization_id, 'roles.read')
        or private.user_has_active_membership(r.organization_id)
      )
  )
);

-- Mutations only via provisioning / future admin tooling with service role for Phase 1.
-- Authenticated users cannot change the permission matrix in Phase 1.

-- ---------------------------------------------------------------------------
-- membership_roles
-- ---------------------------------------------------------------------------

create policy membership_roles_select
on public.membership_roles for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.id = membership_id
      and (
        m.user_id = auth.uid()
        or private.user_has_permission(m.organization_id, 'roles.read')
        or private.user_has_permission(m.organization_id, 'members.read')
      )
  )
);

create policy membership_roles_insert
on public.membership_roles for insert to authenticated
with check (
  exists (
    select 1
    from public.organization_memberships m
    join public.roles r on r.id = role_id
    where m.id = membership_id
      and r.organization_id = m.organization_id
      and private.user_has_permission(m.organization_id, 'roles.manage')
  )
);

create policy membership_roles_delete
on public.membership_roles for delete to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.id = membership_id
      and private.user_has_permission(m.organization_id, 'roles.manage')
  )
);

-- ---------------------------------------------------------------------------
-- membership_location_scopes
-- ---------------------------------------------------------------------------

create policy membership_location_scopes_select
on public.membership_location_scopes for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.id = membership_id
      and (
        m.user_id = auth.uid()
        or private.user_has_permission(m.organization_id, 'members.read')
      )
  )
);

create policy membership_location_scopes_insert
on public.membership_location_scopes for insert to authenticated
with check (
  exists (
    select 1
    from public.organization_memberships m
    join public.locations l on l.id = location_id
    where m.id = membership_id
      and l.organization_id = m.organization_id
      and private.user_has_permission(m.organization_id, 'members.manage')
  )
);

create policy membership_location_scopes_delete
on public.membership_location_scopes for delete to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.id = membership_id
      and private.user_has_permission(m.organization_id, 'members.manage')
  )
);

-- ---------------------------------------------------------------------------
-- audit_events — append-only for tenants
-- ---------------------------------------------------------------------------

create policy audit_events_select
on public.audit_events for select to authenticated
using (
  organization_id is not null
  and private.user_has_permission(organization_id, 'audit.read')
);

create policy audit_events_insert
on public.audit_events for insert to authenticated
with check (
  organization_id is not null
  and private.user_has_active_membership(organization_id)
  and actor_user_id = auth.uid()
);

-- Explicitly no update/delete policies.
