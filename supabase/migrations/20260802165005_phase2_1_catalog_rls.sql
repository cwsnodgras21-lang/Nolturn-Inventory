-- Phase 2.1: RLS for units_of_measure and item_categories

alter table public.units_of_measure enable row level security;
alter table public.units_of_measure force row level security;

alter table public.item_categories enable row level security;
alter table public.item_categories force row level security;

-- Units
create policy units_select
on public.units_of_measure for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy units_insert
on public.units_of_measure for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'catalog.manage')
);

create policy units_update
on public.units_of_measure for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));

-- No delete policy — status changes only.

-- Categories
create policy categories_select
on public.item_categories for select to authenticated
using (private.user_has_permission(organization_id, 'catalog.read'));

create policy categories_insert
on public.item_categories for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'catalog.manage')
);

create policy categories_update
on public.item_categories for update to authenticated
using (private.user_has_permission(organization_id, 'catalog.manage'))
with check (private.user_has_permission(organization_id, 'catalog.manage'));
