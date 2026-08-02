-- Phase 2.3: RLS for storage areas and bins (permission + location access)

alter table public.storage_areas enable row level security;
alter table public.storage_areas force row level security;
alter table public.storage_bins enable row level security;
alter table public.storage_bins force row level security;

-- storage_areas
create policy storage_areas_select on public.storage_areas for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.storage.read')
  and private.user_can_access_location(location_id)
);

create policy storage_areas_insert on public.storage_areas for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.storage.manage')
  and private.user_can_access_location(location_id)
);

create policy storage_areas_update on public.storage_areas for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.storage.manage')
  and private.user_can_access_location(location_id)
)
with check (
  private.user_has_permission(organization_id, 'inventory.storage.manage')
  and private.user_can_access_location(location_id)
);

-- storage_bins: location access via parent storage area
create policy storage_bins_select on public.storage_bins for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.storage.read')
  and exists (
    select 1
    from public.storage_areas sa
    where sa.id = storage_area_id
      and private.user_can_access_location(sa.location_id)
  )
);

create policy storage_bins_insert on public.storage_bins for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.storage.manage')
  and exists (
    select 1
    from public.storage_areas sa
    where sa.id = storage_area_id
      and private.user_can_access_location(sa.location_id)
  )
);

create policy storage_bins_update on public.storage_bins for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.storage.manage')
  and exists (
    select 1
    from public.storage_areas sa
    where sa.id = storage_area_id
      and private.user_can_access_location(sa.location_id)
  )
)
with check (
  private.user_has_permission(organization_id, 'inventory.storage.manage')
  and exists (
    select 1
    from public.storage_areas sa
    where sa.id = storage_area_id
      and private.user_can_access_location(sa.location_id)
  )
);
