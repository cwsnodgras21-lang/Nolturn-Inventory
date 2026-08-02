-- Phase 2.2: RLS for items, variants, conversions, identifiers

alter table public.items enable row level security;
alter table public.items force row level security;
alter table public.item_variants enable row level security;
alter table public.item_variants force row level security;
alter table public.item_unit_conversions enable row level security;
alter table public.item_unit_conversions force row level security;
alter table public.item_identifiers enable row level security;
alter table public.item_identifiers force row level security;

-- items
create policy items_select on public.items for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy items_insert on public.items for insert to authenticated
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy items_update on public.items for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));

-- variants
create policy item_variants_select on public.item_variants for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy item_variants_insert on public.item_variants for insert to authenticated
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy item_variants_update on public.item_variants for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));

-- conversions (delete allowed for manage — conversions are configuration, not ledger)
create policy item_unit_conversions_select on public.item_unit_conversions for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy item_unit_conversions_insert on public.item_unit_conversions for insert to authenticated
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy item_unit_conversions_update on public.item_unit_conversions for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy item_unit_conversions_delete on public.item_unit_conversions for delete to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'));

-- identifiers
create policy item_identifiers_select on public.item_identifiers for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy item_identifiers_insert on public.item_identifiers for insert to authenticated
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy item_identifiers_update on public.item_identifiers for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));

create policy item_identifiers_delete on public.item_identifiers for delete to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'));
