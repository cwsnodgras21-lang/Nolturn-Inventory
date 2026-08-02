-- Phase 2.5: movement types, source dimensions, negative stock, unified completion

drop function if exists private.next_inventory_transaction_number(uuid);

-- ---------------------------------------------------------------------------
-- Header: expand types + optional receipt reference
-- ---------------------------------------------------------------------------

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_transaction_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_transaction_type_check check (
    transaction_type in (
      'opening_balance',
      'positive_adjustment',
      'negative_adjustment',
      'receipt',
      'consumption',
      'transfer'
    )
  );

alter table public.inventory_transactions
  add column if not exists reference_text text;

comment on column public.inventory_transactions.reference_text is
  'Optional external reference (e.g. delivery note). Not a purchase-order link.';

-- ---------------------------------------------------------------------------
-- Lines: nullable destination + source dimensions
-- ---------------------------------------------------------------------------

alter table public.inventory_transaction_lines
  alter column destination_location_id drop not null;

alter table public.inventory_transaction_lines
  alter column destination_storage_area_id drop not null;

alter table public.inventory_transaction_lines
  add column if not exists source_location_id uuid references public.locations (id) on delete restrict;

alter table public.inventory_transaction_lines
  add column if not exists source_storage_area_id uuid references public.storage_areas (id) on delete restrict;

alter table public.inventory_transaction_lines
  add column if not exists source_bin_id uuid references public.storage_bins (id) on delete restrict;

create index if not exists inventory_transaction_lines_source_location_idx
  on public.inventory_transaction_lines (source_location_id);

-- ---------------------------------------------------------------------------
-- Ledger: allow two effects per transfer line
-- ---------------------------------------------------------------------------

alter table public.inventory_ledger_entries
  drop constraint if exists inventory_ledger_entries_line_unique;

alter table public.inventory_ledger_entries
  add column if not exists effect_role text not null default 'primary'
    check (effect_role in ('primary', 'source', 'destination'));

alter table public.inventory_ledger_entries
  add constraint inventory_ledger_entries_line_role_unique
    unique (transaction_line_id, effect_role);

-- ---------------------------------------------------------------------------
-- Numbering by type
-- ---------------------------------------------------------------------------

create or replace function private.next_inventory_transaction_number(
  p_organization_id uuid,
  p_transaction_type text default 'positive_adjustment'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next bigint;
  v_prefix text;
begin
  insert into public.inventory_transaction_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.inventory_transaction_counters.last_number + 1
  returning last_number into v_next;

  v_prefix := case p_transaction_type
    when 'receipt' then 'RCV-'
    when 'consumption' then 'CON-'
    when 'transfer' then 'XFR-'
    when 'negative_adjustment' then 'NADJ-'
    when 'opening_balance' then 'OB-'
    else 'ADJ-'
  end;

  return v_prefix || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function private.assign_inventory_transaction_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transaction_number is null or trim(new.transaction_number) = '' then
    new.transaction_number := private.next_inventory_transaction_number(
      new.organization_id,
      new.transaction_type
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Line integrity for source + destination by context
-- ---------------------------------------------------------------------------

create or replace function private.enforce_inventory_line_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  txn_org uuid;
  txn_type text;
  item_org uuid;
  item_requires boolean;
  variant_item uuid;
  variant_org uuid;
  loc_org uuid;
  area_org uuid;
  area_loc uuid;
  bin_org uuid;
  bin_area uuid;
  unit_org uuid;
  has_source boolean;
  has_dest boolean;
begin
  select organization_id, transaction_type into txn_org, txn_type
  from public.inventory_transactions where id = new.transaction_id;

  if txn_org is null or txn_org <> new.organization_id then
    raise exception 'transaction line must belong to the same organization as its transaction';
  end if;

  select organization_id, requires_variant
    into item_org, item_requires
  from public.items where id = new.item_id;

  if item_org is null or item_org <> new.organization_id then
    raise exception 'line item must belong to the same organization';
  end if;

  if item_requires and new.variant_id is null then
    raise exception 'item requires a variant';
  end if;

  if new.variant_id is not null then
    select item_id, organization_id into variant_item, variant_org
    from public.item_variants where id = new.variant_id;
    if variant_item is null or variant_item <> new.item_id then
      raise exception 'variant must belong to the selected item';
    end if;
    if variant_org is null or variant_org <> new.organization_id then
      raise exception 'variant must belong to the same organization';
    end if;
  end if;

  select organization_id into unit_org from public.units_of_measure where id = new.entered_unit_id;
  if unit_org is null or unit_org <> new.organization_id then
    raise exception 'entered unit must belong to the same organization';
  end if;

  has_source := new.source_location_id is not null
    or new.source_storage_area_id is not null
    or new.source_bin_id is not null;
  has_dest := new.destination_location_id is not null
    or new.destination_storage_area_id is not null
    or new.destination_bin_id is not null;

  if txn_type in ('opening_balance', 'positive_adjustment', 'receipt') then
    if new.destination_location_id is null or new.destination_storage_area_id is null then
      raise exception 'destination location and storage area are required';
    end if;
    if has_source then
      raise exception 'source storage is not allowed for this transaction type';
    end if;
  elsif txn_type in ('consumption', 'negative_adjustment') then
    if new.source_location_id is null or new.source_storage_area_id is null then
      raise exception 'source location and storage area are required';
    end if;
    if has_dest then
      raise exception 'destination storage is not allowed for this transaction type';
    end if;
  elsif txn_type = 'transfer' then
    if new.source_location_id is null or new.source_storage_area_id is null then
      raise exception 'source location and storage area are required';
    end if;
    if new.destination_location_id is null or new.destination_storage_area_id is null then
      raise exception 'destination location and storage area are required';
    end if;
    if new.source_location_id = new.destination_location_id
      and new.source_storage_area_id = new.destination_storage_area_id
      and new.source_bin_id is not distinct from new.destination_bin_id then
      raise exception 'transfer source and destination must differ';
    end if;
  end if;

  if new.destination_location_id is not null then
    select organization_id into loc_org from public.locations where id = new.destination_location_id;
    if loc_org is null or loc_org <> new.organization_id then
      raise exception 'destination location must belong to the same organization';
    end if;
  end if;

  if new.destination_storage_area_id is not null then
    select organization_id, location_id into area_org, area_loc
    from public.storage_areas where id = new.destination_storage_area_id;
    if area_org is null or area_org <> new.organization_id then
      raise exception 'destination storage area must belong to the same organization';
    end if;
    if area_loc <> new.destination_location_id then
      raise exception 'destination storage area must belong to the destination location';
    end if;
  end if;

  if new.destination_bin_id is not null then
    select organization_id, storage_area_id into bin_org, bin_area
    from public.storage_bins where id = new.destination_bin_id;
    if bin_org is null or bin_org <> new.organization_id then
      raise exception 'destination bin must belong to the same organization';
    end if;
    if bin_area <> new.destination_storage_area_id then
      raise exception 'destination bin must belong to the destination storage area';
    end if;
  end if;

  if new.source_location_id is not null then
    select organization_id into loc_org from public.locations where id = new.source_location_id;
    if loc_org is null or loc_org <> new.organization_id then
      raise exception 'source location must belong to the same organization';
    end if;
  end if;

  if new.source_storage_area_id is not null then
    select organization_id, location_id into area_org, area_loc
    from public.storage_areas where id = new.source_storage_area_id;
    if area_org is null or area_org <> new.organization_id then
      raise exception 'source storage area must belong to the same organization';
    end if;
    if area_loc <> new.source_location_id then
      raise exception 'source storage area must belong to the source location';
    end if;
  end if;

  if new.source_bin_id is not null then
    select organization_id, storage_area_id into bin_org, bin_area
    from public.storage_bins where id = new.source_bin_id;
    if bin_org is null or bin_org <> new.organization_id then
      raise exception 'source bin must belong to the same organization';
    end if;
    if bin_area <> new.source_storage_area_id then
      raise exception 'source bin must belong to the source storage area';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock lock + negative-stock check at exact dimensions
-- ---------------------------------------------------------------------------

create or replace function private.lock_and_assert_sufficient_stock(
  p_organization_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_storage_area_id uuid,
  p_bin_id uuid,
  p_required numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allow boolean;
  v_qty numeric;
  v_balance_id uuid;
begin
  select allow_negative_stock into v_allow from public.items where id = p_item_id;
  if v_allow is null then
    raise exception 'item not found for stock check';
  end if;

  -- Ensure a balance row exists so we can lock it for concurrency control.
  insert into public.inventory_balances (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, quantity_on_hand
  )
  values (
    p_organization_id, p_item_id, p_variant_id, p_location_id, p_storage_area_id, p_bin_id, 0
  )
  on conflict on constraint inventory_balances_dims_uidx do nothing;

  select id, quantity_on_hand into v_balance_id, v_qty
  from public.inventory_balances
  where organization_id = p_organization_id
    and item_id = p_item_id
    and variant_id is not distinct from p_variant_id
    and location_id = p_location_id
    and storage_area_id = p_storage_area_id
    and bin_id is not distinct from p_bin_id
  for update;

  if not coalesce(v_allow, false) and coalesce(v_qty, 0) < p_required then
    raise exception 'insufficient stock at the selected source storage';
  end if;
end;
$$;

create or replace function private.post_ledger_and_balance(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_transaction_line_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_storage_area_id uuid,
  p_bin_id uuid,
  p_delta numeric,
  p_effect_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_ledger_entries (
    organization_id,
    transaction_id,
    transaction_line_id,
    item_id,
    variant_id,
    location_id,
    storage_area_id,
    bin_id,
    quantity_delta,
    effect_role,
    occurred_at
  ) values (
    p_organization_id,
    p_transaction_id,
    p_transaction_line_id,
    p_item_id,
    p_variant_id,
    p_location_id,
    p_storage_area_id,
    p_bin_id,
    p_delta,
    p_effect_role,
    timezone('utc', now())
  );

  perform private.apply_inventory_balance_delta(
    p_organization_id,
    p_item_id,
    p_variant_id,
    p_location_id,
    p_storage_area_id,
    p_bin_id,
    p_delta
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Unified completion RPC
-- ---------------------------------------------------------------------------

create or replace function public.complete_inventory_transaction(p_transaction_id uuid)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn public.inventory_transactions%rowtype;
  v_line public.inventory_transaction_lines%rowtype;
  v_multiplier numeric;
  v_base_qty numeric;
  v_line_count int := 0;
  v_permission text;
begin
  select * into v_txn
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'inventory transaction not found';
  end if;

  v_permission := case v_txn.transaction_type
    when 'receipt' then 'inventory.receive'
    when 'consumption' then 'inventory.consume'
    when 'transfer' then 'inventory.transfer'
    else 'inventory.adjust'
  end;

  if not private.user_has_permission(v_txn.organization_id, v_permission) then
    raise exception 'permission denied to complete inventory transaction';
  end if;

  if v_txn.status = 'completed' then
    raise exception 'inventory transaction already completed';
  end if;

  if v_txn.status <> 'draft' then
    raise exception 'only draft inventory transactions can be completed';
  end if;

  if v_txn.transaction_type = 'negative_adjustment'
    and (v_txn.notes is null or trim(v_txn.notes) = '') then
    raise exception 'negative adjustment requires a reason';
  end if;

  for v_line in
    select * from public.inventory_transaction_lines
    where transaction_id = v_txn.id
    order by line_number
    for update
  loop
    v_line_count := v_line_count + 1;

    if v_line.source_location_id is not null
      and not private.user_can_access_location(v_line.source_location_id) then
      raise exception 'source location is not accessible';
    end if;

    if v_line.destination_location_id is not null
      and not private.user_can_access_location(v_line.destination_location_id) then
      raise exception 'destination location is not accessible';
    end if;

    v_multiplier := private.resolve_item_conversion_multiplier(
      v_line.item_id,
      v_line.entered_unit_id
    );
    v_base_qty := v_line.entered_quantity * v_multiplier;

    if v_base_qty <= 0 then
      raise exception 'base quantity must be greater than zero';
    end if;

    update public.inventory_transaction_lines
    set conversion_multiplier = v_multiplier,
        base_quantity = v_base_qty
    where id = v_line.id;

    if v_txn.transaction_type in ('opening_balance', 'positive_adjustment', 'receipt') then
      perform private.post_ledger_and_balance(
        v_txn.organization_id,
        v_txn.id,
        v_line.id,
        v_line.item_id,
        v_line.variant_id,
        v_line.destination_location_id,
        v_line.destination_storage_area_id,
        v_line.destination_bin_id,
        v_base_qty,
        'primary'
      );

    elsif v_txn.transaction_type in ('consumption', 'negative_adjustment') then
      perform private.lock_and_assert_sufficient_stock(
        v_txn.organization_id,
        v_line.item_id,
        v_line.variant_id,
        v_line.source_location_id,
        v_line.source_storage_area_id,
        v_line.source_bin_id,
        v_base_qty
      );
      perform private.post_ledger_and_balance(
        v_txn.organization_id,
        v_txn.id,
        v_line.id,
        v_line.item_id,
        v_line.variant_id,
        v_line.source_location_id,
        v_line.source_storage_area_id,
        v_line.source_bin_id,
        -v_base_qty,
        'primary'
      );

    elsif v_txn.transaction_type = 'transfer' then
      perform private.lock_and_assert_sufficient_stock(
        v_txn.organization_id,
        v_line.item_id,
        v_line.variant_id,
        v_line.source_location_id,
        v_line.source_storage_area_id,
        v_line.source_bin_id,
        v_base_qty
      );
      perform private.post_ledger_and_balance(
        v_txn.organization_id,
        v_txn.id,
        v_line.id,
        v_line.item_id,
        v_line.variant_id,
        v_line.source_location_id,
        v_line.source_storage_area_id,
        v_line.source_bin_id,
        -v_base_qty,
        'source'
      );
      perform private.post_ledger_and_balance(
        v_txn.organization_id,
        v_txn.id,
        v_line.id,
        v_line.item_id,
        v_line.variant_id,
        v_line.destination_location_id,
        v_line.destination_storage_area_id,
        v_line.destination_bin_id,
        v_base_qty,
        'destination'
      );
    else
      raise exception 'unsupported inventory transaction type';
    end if;
  end loop;

  if v_line_count = 0 then
    raise exception 'cannot complete inventory transaction without lines';
  end if;

  update public.inventory_transactions
  set status = 'completed',
      completed_by = auth.uid(),
      completed_at = timezone('utc', now())
  where id = v_txn.id
  returning * into v_txn;

  return v_txn;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: lines visible if user can access source OR destination location
-- ---------------------------------------------------------------------------

drop policy if exists inventory_transaction_lines_select on public.inventory_transaction_lines;
drop policy if exists inventory_transaction_lines_insert on public.inventory_transaction_lines;
drop policy if exists inventory_transaction_lines_update on public.inventory_transaction_lines;
drop policy if exists inventory_transaction_lines_delete on public.inventory_transaction_lines;

create policy inventory_transaction_lines_select on public.inventory_transaction_lines for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.read')
  and (
    (destination_location_id is not null and private.user_can_access_location(destination_location_id))
    or (source_location_id is not null and private.user_can_access_location(source_location_id))
  )
);

create policy inventory_transaction_lines_insert on public.inventory_transaction_lines for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.adjust')
  or private.user_has_permission(organization_id, 'inventory.receive')
  or private.user_has_permission(organization_id, 'inventory.consume')
  or private.user_has_permission(organization_id, 'inventory.transfer')
);

-- Note: location access for insert/update is enforced in app commands + completion RPC.
-- Draft line writes still require one of the movement permissions above.

create policy inventory_transaction_lines_update on public.inventory_transaction_lines for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.adjust')
  or private.user_has_permission(organization_id, 'inventory.receive')
  or private.user_has_permission(organization_id, 'inventory.consume')
  or private.user_has_permission(organization_id, 'inventory.transfer')
)
with check (
  private.user_has_permission(organization_id, 'inventory.adjust')
  or private.user_has_permission(organization_id, 'inventory.receive')
  or private.user_has_permission(organization_id, 'inventory.consume')
  or private.user_has_permission(organization_id, 'inventory.transfer')
);

create policy inventory_transaction_lines_delete on public.inventory_transaction_lines for delete to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.adjust')
  or private.user_has_permission(organization_id, 'inventory.receive')
  or private.user_has_permission(organization_id, 'inventory.consume')
  or private.user_has_permission(organization_id, 'inventory.transfer')
);

-- Transaction insert: any movement permission may create drafts
drop policy if exists inventory_transactions_insert on public.inventory_transactions;
drop policy if exists inventory_transactions_update on public.inventory_transactions;

create policy inventory_transactions_insert on public.inventory_transactions for insert to authenticated
with check (
  status = 'draft'
  and (
    private.user_has_permission(organization_id, 'inventory.adjust')
    or private.user_has_permission(organization_id, 'inventory.receive')
    or private.user_has_permission(organization_id, 'inventory.consume')
    or private.user_has_permission(organization_id, 'inventory.transfer')
  )
);

create policy inventory_transactions_update on public.inventory_transactions for update to authenticated
using (
  status = 'draft'
  and (
    private.user_has_permission(organization_id, 'inventory.adjust')
    or private.user_has_permission(organization_id, 'inventory.receive')
    or private.user_has_permission(organization_id, 'inventory.consume')
    or private.user_has_permission(organization_id, 'inventory.transfer')
  )
)
with check (
  status in ('draft', 'cancelled')
  and (
    private.user_has_permission(organization_id, 'inventory.adjust')
    or private.user_has_permission(organization_id, 'inventory.receive')
    or private.user_has_permission(organization_id, 'inventory.consume')
    or private.user_has_permission(organization_id, 'inventory.transfer')
  )
);
