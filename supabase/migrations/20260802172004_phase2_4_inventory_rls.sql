-- Phase 2.4: RLS for inventory ledger tables

alter table public.inventory_transactions enable row level security;
alter table public.inventory_transactions force row level security;
alter table public.inventory_transaction_lines enable row level security;
alter table public.inventory_transaction_lines force row level security;
alter table public.inventory_ledger_entries enable row level security;
alter table public.inventory_ledger_entries force row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_balances force row level security;
alter table public.inventory_transaction_counters enable row level security;
alter table public.inventory_transaction_counters force row level security;

-- counters: no direct tenant access
create policy inventory_transaction_counters_deny on public.inventory_transaction_counters
for all to authenticated
using (false)
with check (false);

-- transactions
create policy inventory_transactions_select on public.inventory_transactions for select to authenticated
using (private.user_has_permission(organization_id, 'inventory.read'));

create policy inventory_transactions_insert on public.inventory_transactions for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and status = 'draft'
);

create policy inventory_transactions_update on public.inventory_transactions for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and status = 'draft'
)
with check (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and status in ('draft', 'cancelled')
);

-- lines: select if can read inventory; location must be accessible for visibility
create policy inventory_transaction_lines_select on public.inventory_transaction_lines for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.read')
  and private.user_can_access_location(destination_location_id)
);

create policy inventory_transaction_lines_insert on public.inventory_transaction_lines for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and private.user_can_access_location(destination_location_id)
);

create policy inventory_transaction_lines_update on public.inventory_transaction_lines for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and private.user_can_access_location(destination_location_id)
)
with check (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and private.user_can_access_location(destination_location_id)
);

create policy inventory_transaction_lines_delete on public.inventory_transaction_lines for delete to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.adjust')
  and private.user_can_access_location(destination_location_id)
);

-- ledger: read only for tenants (location scoped)
create policy inventory_ledger_entries_select on public.inventory_ledger_entries for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.read')
  and private.user_can_access_location(location_id)
);

-- balances: read only for tenants (location scoped); no direct writes
create policy inventory_balances_select on public.inventory_balances for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.read')
  and private.user_can_access_location(location_id)
);

-- Fix balance upsert to target named unique constraint (NULLS NOT DISTINCT)
create or replace function private.apply_inventory_balance_delta(
  p_organization_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_storage_area_id uuid,
  p_bin_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_balances (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, quantity_on_hand
  )
  values (
    p_organization_id, p_item_id, p_variant_id, p_location_id, p_storage_area_id, p_bin_id, p_delta
  )
  on conflict on constraint inventory_balances_dims_uidx
  do update set
    quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand,
    updated_at = timezone('utc', now());
end;
$$;
