-- Phase 3.3: lot tracking and expiration foundation

-- ---------------------------------------------------------------------------
-- Item tracking mode
-- ---------------------------------------------------------------------------

alter table public.items
  add column if not exists tracking_mode text not null default 'quantity'
    constraint items_tracking_mode_check check (tracking_mode in ('quantity', 'lot'));

comment on column public.items.tracking_mode is
  'quantity = no lot required; lot = every movement must reference an inventory lot.';

create or replace function private.enforce_item_tracking_mode_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.tracking_mode is distinct from old.tracking_mode
    and exists (
      select 1 from public.inventory_ledger_entries e
      where e.item_id = old.id
      limit 1
    ) then
    raise exception 'tracking mode cannot change after inventory activity without a controlled migration';
  end if;
  return new;
end;
$$;

drop trigger if exists items_tracking_mode_guard on public.items;
create trigger items_tracking_mode_guard
before update on public.items
for each row execute function private.enforce_item_tracking_mode_change();

-- ---------------------------------------------------------------------------
-- Lots
-- ---------------------------------------------------------------------------

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  lot_number text not null,
  expiration_date date,
  status text not null default 'active'
    check (status in ('active', 'quarantined', 'depleted', 'expired')),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_lots_number_nonempty check (char_length(trim(lot_number)) > 0)
);

create unique index inventory_lots_scope_number_uidx
  on public.inventory_lots (organization_id, item_id, variant_id, lower(trim(lot_number)))
  nulls not distinct;

create index inventory_lots_item_idx
  on public.inventory_lots (organization_id, item_id, status);

create index inventory_lots_expiration_idx
  on public.inventory_lots (organization_id, expiration_date)
  where expiration_date is not null;

comment on table public.inventory_lots is
  'Lots for lot-tracked items. Soft status; do not hard-delete when ledger history exists.';

drop trigger if exists inventory_lots_set_updated_at on public.inventory_lots;
create trigger inventory_lots_set_updated_at
before update on public.inventory_lots
for each row execute function public.set_updated_at();

create or replace function private.enforce_inventory_lot_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_org uuid;
  v_mode text;
  v_requires boolean;
  v_variant_item uuid;
  v_variant_org uuid;
begin
  select organization_id, tracking_mode, requires_variant
    into v_item_org, v_mode, v_requires
  from public.items where id = new.item_id;

  if v_item_org is null or v_item_org <> new.organization_id then
    raise exception 'lot item must belong to the same organization';
  end if;
  if v_mode <> 'lot' then
    raise exception 'lots can only be created for lot-tracked items';
  end if;
  if v_requires and new.variant_id is null then
    raise exception 'lot requires a variant for this item';
  end if;
  if new.variant_id is not null then
    select item_id, organization_id into v_variant_item, v_variant_org
    from public.item_variants where id = new.variant_id;
    if v_variant_item is null or v_variant_item <> new.item_id then
      raise exception 'lot variant must belong to the selected item';
    end if;
    if v_variant_org is null or v_variant_org <> new.organization_id then
      raise exception 'lot variant must belong to the same organization';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_lots_integrity on public.inventory_lots;
create trigger inventory_lots_integrity
before insert or update on public.inventory_lots
for each row execute function private.enforce_inventory_lot_integrity();

-- ---------------------------------------------------------------------------
-- Extend dimensions with lot_id
-- ---------------------------------------------------------------------------

alter table public.inventory_transaction_lines
  add column if not exists lot_id uuid references public.inventory_lots (id) on delete restrict;

create index if not exists inventory_transaction_lines_lot_idx
  on public.inventory_transaction_lines (lot_id)
  where lot_id is not null;

alter table public.inventory_ledger_entries
  add column if not exists lot_id uuid references public.inventory_lots (id) on delete restrict;

drop index if exists inventory_ledger_entries_balance_dims_idx;
create index inventory_ledger_entries_balance_dims_idx
  on public.inventory_ledger_entries (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id
  );

alter table public.inventory_balances
  add column if not exists lot_id uuid references public.inventory_lots (id) on delete restrict;

alter table public.inventory_balances
  drop constraint if exists inventory_balances_dims_uidx;

alter table public.inventory_balances
  add constraint inventory_balances_dims_uidx
  unique nulls not distinct (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id
  );

alter table public.count_lines
  add column if not exists lot_id uuid references public.inventory_lots (id) on delete restrict;

drop index if exists count_lines_dimension_uidx;
create unique index count_lines_dimension_uidx
  on public.count_lines (
    count_session_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id
  ) nulls not distinct;

-- ---------------------------------------------------------------------------
-- Lot helpers
-- ---------------------------------------------------------------------------

create or replace function private.assert_lot_for_item(
  p_lot_id uuid,
  p_organization_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_require_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.inventory_lots%rowtype;
  v_mode text;
begin
  select tracking_mode into v_mode from public.items where id = p_item_id;
  if v_mode = 'lot' then
    if p_lot_id is null then
      raise exception 'lot-tracked items require a lot';
    end if;
  else
    if p_lot_id is not null then
      raise exception 'quantity-only items cannot reference a lot';
    end if;
    return;
  end if;

  select * into v_lot from public.inventory_lots where id = p_lot_id;
  if v_lot.id is null then
    raise exception 'lot not found';
  end if;
  if v_lot.organization_id <> p_organization_id then
    raise exception 'lot must belong to the same organization';
  end if;
  if v_lot.item_id <> p_item_id then
    raise exception 'lot must match the item';
  end if;
  if v_lot.variant_id is distinct from p_variant_id then
    raise exception 'lot must match the variant';
  end if;
  if p_require_active and v_lot.status <> 'active' then
    raise exception 'lot is not available for inventory movements';
  end if;
end;
$$;

create or replace function private.sync_lot_depleted_status(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty numeric;
  v_status text;
begin
  if p_lot_id is null then
    return;
  end if;

  select coalesce(sum(quantity_on_hand), 0) into v_qty
  from public.inventory_balances
  where lot_id = p_lot_id;

  select status into v_status from public.inventory_lots where id = p_lot_id;
  if v_status is null then
    return;
  end if;

  if v_qty <= 0 and v_status = 'active' then
    update public.inventory_lots set status = 'depleted' where id = p_lot_id;
  elsif v_qty > 0 and v_status = 'depleted' then
    update public.inventory_lots set status = 'active' where id = p_lot_id;
  end if;
end;
$$;

-- Drop old helper signatures and recreate with lot_id
drop function if exists private.apply_inventory_balance_delta(uuid, uuid, uuid, uuid, uuid, uuid, numeric);
drop function if exists private.post_ledger_and_balance(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, text);
drop function if exists private.lock_and_assert_sufficient_stock(uuid, uuid, uuid, uuid, uuid, uuid, numeric);

create or replace function private.apply_inventory_balance_delta(
  p_organization_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_storage_area_id uuid,
  p_bin_id uuid,
  p_lot_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_balances (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id, quantity_on_hand
  )
  values (
    p_organization_id, p_item_id, p_variant_id, p_location_id, p_storage_area_id, p_bin_id, p_lot_id, p_delta
  )
  on conflict on constraint inventory_balances_dims_uidx
  do update set
    quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand,
    updated_at = timezone('utc', now());

  perform private.sync_lot_depleted_status(p_lot_id);
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
  p_lot_id uuid,
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
    lot_id,
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
    p_lot_id,
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
    p_lot_id,
    p_delta
  );
end;
$$;

create or replace function private.lock_and_assert_sufficient_stock(
  p_organization_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_storage_area_id uuid,
  p_bin_id uuid,
  p_lot_id uuid,
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
begin
  select allow_negative_stock into v_allow from public.items where id = p_item_id;
  if v_allow is null then
    raise exception 'item not found for stock check';
  end if;

  insert into public.inventory_balances (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id, quantity_on_hand
  )
  values (
    p_organization_id, p_item_id, p_variant_id, p_location_id, p_storage_area_id, p_bin_id, p_lot_id, 0
  )
  on conflict on constraint inventory_balances_dims_uidx do nothing;

  select quantity_on_hand into v_qty
  from public.inventory_balances
  where organization_id = p_organization_id
    and item_id = p_item_id
    and variant_id is not distinct from p_variant_id
    and location_id = p_location_id
    and storage_area_id = p_storage_area_id
    and bin_id is not distinct from p_bin_id
    and lot_id is not distinct from p_lot_id
  for update;

  if not coalesce(v_allow, false) and coalesce(v_qty, 0) < p_required then
    raise exception 'insufficient stock at the selected source storage';
  end if;
end;
$$;


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
  v_requires_variant boolean;
  variant_item uuid;
  variant_org uuid;
  unit_org uuid;
  loc_org uuid;
  area_org uuid;
  area_loc uuid;
  bin_org uuid;
  bin_area uuid;
  has_source boolean;
  has_dest boolean;
begin
  select organization_id, transaction_type into txn_org, txn_type
  from public.inventory_transactions where id = new.transaction_id;

  if txn_org is null or txn_org <> new.organization_id then
    raise exception 'transaction line organization mismatch';
  end if;

  select i.organization_id, i.requires_variant into item_org, v_requires_variant
  from public.items i where i.id = new.item_id;
  if item_org is null or item_org <> new.organization_id then
    raise exception 'item must belong to the same organization';
  end if;
  if v_requires_variant and new.variant_id is null then
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
      raise exception 'destination storage is required';
    end if;
    if has_source then
      raise exception 'source storage is not allowed for this transaction type';
    end if;
  elsif txn_type in ('consumption', 'negative_adjustment') then
    if new.source_location_id is null or new.source_storage_area_id is null then
      raise exception 'source storage is required';
    end if;
    if has_dest then
      raise exception 'destination storage is not allowed for this transaction type';
    end if;
  elsif txn_type = 'transfer' then
    if new.source_location_id is null or new.source_storage_area_id is null
      or new.destination_location_id is null or new.destination_storage_area_id is null then
      raise exception 'transfer requires source and destination storage';
    end if;
    if new.source_location_id = new.destination_location_id
      and new.source_storage_area_id = new.destination_storage_area_id
      and new.source_bin_id is not distinct from new.destination_bin_id then
      raise exception 'transfer source and destination must differ';
    end if;
  elsif txn_type = 'reversal' then
    if not has_source and not has_dest then
      raise exception 'reversal lines require storage sides';
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

  perform private.assert_lot_for_item(
    new.lot_id,
    new.organization_id,
    new.item_id,
    new.variant_id,
    txn_type <> 'reversal'
  );

  return new;
end;
$$;

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

    perform private.assert_lot_for_item(
      v_line.lot_id,
      v_txn.organization_id,
      v_line.item_id,
      v_line.variant_id,
      true
    );

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
        v_txn.organization_id, v_txn.id, v_line.id,
        v_line.item_id, v_line.variant_id,
        v_line.destination_location_id, v_line.destination_storage_area_id, v_line.destination_bin_id,
        v_line.lot_id, v_base_qty, 'primary'
      );
    elsif v_txn.transaction_type in ('consumption', 'negative_adjustment') then
      perform private.lock_and_assert_sufficient_stock(
        v_txn.organization_id, v_line.item_id, v_line.variant_id,
        v_line.source_location_id, v_line.source_storage_area_id, v_line.source_bin_id,
        v_line.lot_id, v_base_qty
      );
      perform private.post_ledger_and_balance(
        v_txn.organization_id, v_txn.id, v_line.id,
        v_line.item_id, v_line.variant_id,
        v_line.source_location_id, v_line.source_storage_area_id, v_line.source_bin_id,
        v_line.lot_id, -v_base_qty, 'primary'
      );
    elsif v_txn.transaction_type = 'transfer' then
      perform private.lock_and_assert_sufficient_stock(
        v_txn.organization_id, v_line.item_id, v_line.variant_id,
        v_line.source_location_id, v_line.source_storage_area_id, v_line.source_bin_id,
        v_line.lot_id, v_base_qty
      );
      perform private.post_ledger_and_balance(
        v_txn.organization_id, v_txn.id, v_line.id,
        v_line.item_id, v_line.variant_id,
        v_line.source_location_id, v_line.source_storage_area_id, v_line.source_bin_id,
        v_line.lot_id, -v_base_qty, 'source'
      );
      perform private.post_ledger_and_balance(
        v_txn.organization_id, v_txn.id, v_line.id,
        v_line.item_id, v_line.variant_id,
        v_line.destination_location_id, v_line.destination_storage_area_id, v_line.destination_bin_id,
        v_line.lot_id, v_base_qty, 'destination'
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


create or replace function public.reverse_inventory_transaction(p_transaction_id uuid, p_reason text)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.inventory_transactions%rowtype;
  v_reversal public.inventory_transactions%rowtype;
  v_line public.inventory_transaction_lines%rowtype;
  v_entry public.inventory_ledger_entries%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_reason = '' then
    raise exception 'reversal requires a reason';
  end if;

  select * into v_original
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'inventory transaction not found';
  end if;

  if not private.user_has_permission(v_original.organization_id, 'inventory.reverse') then
    raise exception 'permission denied to reverse inventory transaction';
  end if;

  if v_original.transaction_type = 'reversal' then
    raise exception 'reversal transactions cannot be reversed';
  end if;

  if v_original.status = 'reversed' or v_original.reversed_by_transaction_id is not null then
    raise exception 'inventory transaction already reversed';
  end if;

  if v_original.status <> 'completed' then
    raise exception 'only completed inventory transactions can be reversed';
  end if;

  for v_entry in
    select distinct on (location_id) *
    from public.inventory_ledger_entries
    where transaction_id = v_original.id
  loop
    if not private.user_can_access_location(v_entry.location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  for v_entry in
    select *
    from public.inventory_ledger_entries
    where transaction_id = v_original.id
    order by occurred_at, id
  loop
    if v_entry.quantity_delta > 0 then
      perform private.lock_and_assert_sufficient_stock(
        v_original.organization_id,
        v_entry.item_id,
        v_entry.variant_id,
        v_entry.location_id,
        v_entry.storage_area_id,
        v_entry.bin_id,
        v_entry.lot_id,
        v_entry.quantity_delta
      );
    end if;
  end loop;

  insert into public.inventory_transactions (
    organization_id,
    transaction_type,
    status,
    notes,
    transaction_number,
    created_by,
    reverses_transaction_id
  ) values (
    v_original.organization_id,
    'reversal',
    'draft',
    v_reason,
    '',
    auth.uid(),
    v_original.id
  )
  returning * into v_reversal;

  for v_line in
    select *
    from public.inventory_transaction_lines
    where transaction_id = v_original.id
    order by line_number
  loop
    insert into public.inventory_transaction_lines (
      organization_id,
      transaction_id,
      line_number,
      item_id,
      variant_id,
      entered_quantity,
      entered_unit_id,
      conversion_multiplier,
      base_quantity,
      destination_location_id,
      destination_storage_area_id,
      destination_bin_id,
      source_location_id,
      source_storage_area_id,
      source_bin_id,
      lot_id,
      unit_cost,
      notes
    ) values (
      v_line.organization_id,
      v_reversal.id,
      v_line.line_number,
      v_line.item_id,
      v_line.variant_id,
      v_line.entered_quantity,
      v_line.entered_unit_id,
      v_line.conversion_multiplier,
      v_line.base_quantity,
      v_line.destination_location_id,
      v_line.destination_storage_area_id,
      v_line.destination_bin_id,
      v_line.source_location_id,
      v_line.source_storage_area_id,
      v_line.source_bin_id,
      v_line.lot_id,
      v_line.unit_cost,
      v_line.notes
    );
  end loop;

  for v_entry in
    select e.*
    from public.inventory_ledger_entries e
    where e.transaction_id = v_original.id
    order by e.occurred_at, e.id
  loop
    perform private.post_ledger_and_balance(
      v_original.organization_id,
      v_reversal.id,
      (
        select rl.id
        from public.inventory_transaction_lines rl
        join public.inventory_transaction_lines ol
          on ol.transaction_id = v_original.id
         and ol.line_number = rl.line_number
        where rl.transaction_id = v_reversal.id
          and ol.id = v_entry.transaction_line_id
      ),
      v_entry.item_id,
      v_entry.variant_id,
      v_entry.location_id,
      v_entry.storage_area_id,
      v_entry.bin_id,
      v_entry.lot_id,
      -v_entry.quantity_delta,
      v_entry.effect_role
    );
  end loop;

  update public.inventory_transactions
  set status = 'completed',
      completed_by = auth.uid(),
      completed_at = timezone('utc', now())
  where id = v_reversal.id
  returning * into v_reversal;

  update public.inventory_transactions
  set status = 'reversed',
      reversed_by_transaction_id = v_reversal.id
  where id = v_original.id;

  return v_reversal;
end;
$$;

drop function if exists public.reconcile_inventory_balances(uuid);

create or replace function public.rebuild_inventory_balances(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null then
    if not private.user_has_permission(p_organization_id, 'inventory.adjust') then
      raise exception 'permission denied to rebuild inventory balances';
    end if;
  end if;

  delete from public.inventory_balances where organization_id = p_organization_id;

  insert into public.inventory_balances (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id, quantity_on_hand
  )
  select
    organization_id,
    item_id,
    variant_id,
    location_id,
    storage_area_id,
    bin_id,
    lot_id,
    sum(quantity_delta)
  from public.inventory_ledger_entries
  where organization_id = p_organization_id
  group by organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, lot_id
  having sum(quantity_delta) <> 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.reconcile_inventory_balances(p_organization_id uuid)
returns table (
  item_id uuid,
  variant_id uuid,
  location_id uuid,
  storage_area_id uuid,
  bin_id uuid,
  lot_id uuid,
  balance_quantity numeric,
  ledger_quantity numeric,
  difference numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if not private.user_has_permission(p_organization_id, 'inventory.adjust') then
      raise exception 'permission denied to reconcile inventory balances';
    end if;
  end if;

  return query
  with ledger as (
    select
      e.item_id,
      e.variant_id,
      e.location_id,
      e.storage_area_id,
      e.bin_id,
      e.lot_id,
      sum(e.quantity_delta)::numeric as ledger_quantity
    from public.inventory_ledger_entries e
    where e.organization_id = p_organization_id
    group by e.item_id, e.variant_id, e.location_id, e.storage_area_id, e.bin_id, e.lot_id
  ),
  balances as (
    select
      b.item_id,
      b.variant_id,
      b.location_id,
      b.storage_area_id,
      b.bin_id,
      b.lot_id,
      b.quantity_on_hand::numeric as balance_quantity
    from public.inventory_balances b
    where b.organization_id = p_organization_id
  )
  select
    coalesce(b.item_id, l.item_id),
    coalesce(b.variant_id, l.variant_id),
    coalesce(b.location_id, l.location_id),
    coalesce(b.storage_area_id, l.storage_area_id),
    coalesce(b.bin_id, l.bin_id),
    coalesce(b.lot_id, l.lot_id),
    coalesce(b.balance_quantity, 0),
    coalesce(l.ledger_quantity, 0),
    coalesce(b.balance_quantity, 0) - coalesce(l.ledger_quantity, 0)
  from balances b
  full outer join ledger l
    on b.item_id = l.item_id
   and b.variant_id is not distinct from l.variant_id
   and b.location_id = l.location_id
   and b.storage_area_id = l.storage_area_id
   and b.bin_id is not distinct from l.bin_id
   and b.lot_id is not distinct from l.lot_id
  where coalesce(b.balance_quantity, 0) is distinct from coalesce(l.ledger_quantity, 0);
end;
$$;

grant execute on function public.reconcile_inventory_balances(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Count + PO receiving lot awareness
-- ---------------------------------------------------------------------------

create or replace function public.start_count_session(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_location_id uuid;
  v_loc_count integer;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'count session not found';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.perform') then
    raise exception 'permission denied to start inventory count';
  end if;

  if v_session.status <> 'draft' then
    raise exception 'only draft count sessions can be started';
  end if;

  select count(*) into v_loc_count
  from public.count_session_locations
  where count_session_id = v_session.id;

  if v_loc_count = 0 then
    raise exception 'assign at least one location before starting the count';
  end if;

  for v_location_id in
    select location_id from public.count_session_locations where count_session_id = v_session.id
  loop
    if not private.user_can_access_location(v_location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  update public.count_sessions
  set status = 'in_progress',
      started_by = auth.uid(),
      started_at = timezone('utc', now())
  where id = v_session.id
  returning * into v_session;

  insert into public.count_lines (
    organization_id,
    count_session_id,
    item_id,
    variant_id,
    location_id,
    storage_area_id,
    bin_id,
    lot_id,
    expected_quantity,
    status
  )
  select
    b.organization_id,
    v_session.id,
    b.item_id,
    b.variant_id,
    b.location_id,
    b.storage_area_id,
    b.bin_id,
    b.lot_id,
    b.quantity_on_hand,
    'pending'
  from public.inventory_balances b
  join public.count_session_locations csl
    on csl.count_session_id = v_session.id
   and csl.location_id = b.location_id
  where b.organization_id = v_session.organization_id
    and b.quantity_on_hand <> 0;

  return v_session;
end;
$$;

create or replace function private.ensure_inventory_lot(
  p_organization_id uuid,
  p_item_id uuid,
  p_variant_id uuid,
  p_lot_id uuid,
  p_lot_number text,
  p_expiration_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_lot_id uuid;
  v_number text;
begin
  select tracking_mode into v_mode from public.items where id = p_item_id;
  if v_mode is distinct from 'lot' then
    if p_lot_id is not null or (p_lot_number is not null and trim(p_lot_number) <> '') then
      raise exception 'quantity-only items cannot reference a lot';
    end if;
    return null;
  end if;

  if p_lot_id is not null then
    perform private.assert_lot_for_item(p_lot_id, p_organization_id, p_item_id, p_variant_id, true);
    return p_lot_id;
  end if;

  v_number := trim(coalesce(p_lot_number, ''));
  if v_number = '' then
    raise exception 'lot-tracked items require a lot';
  end if;

  select id into v_lot_id
  from public.inventory_lots
  where organization_id = p_organization_id
    and item_id = p_item_id
    and variant_id is not distinct from p_variant_id
    and lower(trim(lot_number)) = lower(v_number);

  if v_lot_id is not null then
    perform private.assert_lot_for_item(v_lot_id, p_organization_id, p_item_id, p_variant_id, true);
    return v_lot_id;
  end if;

  insert into public.inventory_lots (
    organization_id, item_id, variant_id, lot_number, expiration_date, status, created_by
  ) values (
    p_organization_id, p_item_id, p_variant_id, v_number, p_expiration_date, 'active', auth.uid()
  )
  returning id into v_lot_id;

  return v_lot_id;
end;
$$;

-- Patch approve_count to include lot_id on adjustment lines via recreate from known body + lot
create or replace function public.approve_count_session_reconciliation(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_unreviewed integer;
  v_positive_txn uuid;
  v_negative_txn uuid;
  v_line public.count_lines%rowtype;
  v_base_unit_id uuid;
  v_line_no integer;
  v_notes text;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'count session not found';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.review') then
    raise exception 'permission denied to approve inventory count';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.adjust') then
    raise exception 'permission denied to create inventory adjustments for count reconciliation';
  end if;

  if v_session.status <> 'ready_for_review' then
    raise exception 'only counts ready for review can be approved';
  end if;

  select count(*) into v_unreviewed
  from public.count_lines
  where count_session_id = v_session.id
    and status not in ('accepted', 'rejected');

  if v_unreviewed > 0 then
    raise exception 'all count lines must be accepted or rejected before approval';
  end if;

  for v_line in
    select * from public.count_lines
    where count_session_id = v_session.id
  loop
    if not private.user_can_access_location(v_line.location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  v_notes := 'Count reconciliation: ' || v_session.name;

  if exists (
    select 1 from public.count_lines
    where count_session_id = v_session.id
      and status = 'accepted'
      and coalesce(variance, 0) > 0
  ) then
    insert into public.inventory_transactions (
      organization_id, transaction_type, status, notes, transaction_number, created_by
    ) values (
      v_session.organization_id, 'positive_adjustment', 'draft', v_notes, '', auth.uid()
    )
    returning id into v_positive_txn;

    v_line_no := 0;
    for v_line in
      select * from public.count_lines
      where count_session_id = v_session.id
        and status = 'accepted'
        and coalesce(variance, 0) > 0
      order by location_id, item_id
    loop
      v_line_no := v_line_no + 1;
      select base_unit_id into v_base_unit_id from public.items where id = v_line.item_id;

      insert into public.inventory_transaction_lines (
        organization_id, transaction_id, line_number, item_id, variant_id,
        entered_quantity, entered_unit_id, conversion_multiplier, base_quantity,
        destination_location_id, destination_storage_area_id, destination_bin_id,
        lot_id, notes
      ) values (
        v_session.organization_id, v_positive_txn, v_line_no, v_line.item_id, v_line.variant_id,
        v_line.variance, v_base_unit_id, 1, v_line.variance,
        v_line.location_id, v_line.storage_area_id, v_line.bin_id,
        v_line.lot_id, 'Count line ' || v_line.id::text
      );

      update public.count_lines
      set reconciliation_transaction_id = v_positive_txn
      where id = v_line.id;
    end loop;

    perform public.complete_inventory_transaction(v_positive_txn);
  end if;

  if exists (
    select 1 from public.count_lines
    where count_session_id = v_session.id
      and status = 'accepted'
      and coalesce(variance, 0) < 0
  ) then
    insert into public.inventory_transactions (
      organization_id, transaction_type, status, notes, transaction_number, created_by
    ) values (
      v_session.organization_id, 'negative_adjustment', 'draft', v_notes, '', auth.uid()
    )
    returning id into v_negative_txn;

    v_line_no := 0;
    for v_line in
      select * from public.count_lines
      where count_session_id = v_session.id
        and status = 'accepted'
        and coalesce(variance, 0) < 0
      order by location_id, item_id
    loop
      v_line_no := v_line_no + 1;
      select base_unit_id into v_base_unit_id from public.items where id = v_line.item_id;

      insert into public.inventory_transaction_lines (
        organization_id, transaction_id, line_number, item_id, variant_id,
        entered_quantity, entered_unit_id, conversion_multiplier, base_quantity,
        source_location_id, source_storage_area_id, source_bin_id,
        lot_id, notes
      ) values (
        v_session.organization_id, v_negative_txn, v_line_no, v_line.item_id, v_line.variant_id,
        abs(v_line.variance), v_base_unit_id, 1, abs(v_line.variance),
        v_line.location_id, v_line.storage_area_id, v_line.bin_id,
        v_line.lot_id, 'Count line ' || v_line.id::text
      );

      update public.count_lines
      set reconciliation_transaction_id = v_negative_txn
      where id = v_line.id;
    end loop;

    perform public.complete_inventory_transaction(v_negative_txn);
  end if;

  update public.count_sessions
  set status = 'completed',
      completed_by = auth.uid(),
      completed_at = timezone('utc', now())
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_notes text default null,
  p_reference_text text default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_txn public.inventory_transactions%rowtype;
  v_entry jsonb;
  v_line public.purchase_order_lines%rowtype;
  v_qty numeric;
  v_dest_location uuid;
  v_dest_area uuid;
  v_dest_bin uuid;
  v_unit_cost numeric;
  v_base_qty numeric;
  v_item_base uuid;
  v_lot_id uuid;
  v_line_number integer := 0;
  v_any_remaining boolean;
  v_all_zero_remaining boolean;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'receive requires at least one line';
  end if;

  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if v_po.id is null then
    raise exception 'purchase order not found';
  end if;
  if not private.user_has_permission(v_po.organization_id, 'purchasing.receive') then
    raise exception 'permission denied';
  end if;
  if not private.user_has_permission(v_po.organization_id, 'inventory.receive') then
    raise exception 'permission denied';
  end if;
  if v_po.status not in ('submitted', 'partially_received') then
    raise exception 'only submitted or partially received purchase orders can be received';
  end if;

  insert into public.inventory_transactions (
    organization_id, transaction_type, status, transaction_number, notes, reference_text,
    purchase_order_id, created_by
  ) values (
    v_po.organization_id, 'receipt', 'draft', '',
    coalesce(p_notes, 'Receipt against ' || v_po.po_number),
    p_reference_text, v_po.id, auth.uid()
  )
  returning * into v_txn;

  for v_entry in select * from jsonb_array_elements(p_lines)
  loop
    v_line_number := v_line_number + 1;
    select * into v_line
    from public.purchase_order_lines
    where id = (v_entry->>'purchase_order_line_id')::uuid
      and purchase_order_id = v_po.id
    for update;

    if v_line.id is null then
      raise exception 'purchase order line not found on this order';
    end if;

    v_qty := (v_entry->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'receive quantity must be positive';
    end if;
    if v_qty > v_line.remaining_quantity then
      raise exception 'cannot receive more than remaining quantity';
    end if;

    v_dest_location := coalesce(
      (v_entry->>'destination_location_id')::uuid,
      v_po.ship_to_location_id
    );
    v_dest_area := (v_entry->>'destination_storage_area_id')::uuid;
    v_dest_bin := nullif(v_entry->>'destination_bin_id', '')::uuid;
    v_unit_cost := coalesce(
      nullif(v_entry->>'unit_cost', '')::numeric,
      v_line.unit_cost
    );

    if v_dest_area is null then
      raise exception 'destination storage area is required';
    end if;
    if not private.user_can_access_location(v_dest_location) then
      raise exception 'destination location is not accessible';
    end if;

    v_lot_id := private.ensure_inventory_lot(
      v_po.organization_id,
      v_line.item_id,
      v_line.variant_id,
      nullif(v_entry->>'lot_id', '')::uuid,
      nullif(v_entry->>'lot_number', ''),
      nullif(v_entry->>'expiration_date', '')::date
    );

    select base_unit_id into v_item_base from public.items where id = v_line.item_id;
    v_base_qty := v_qty * v_line.conversion_multiplier;

    insert into public.inventory_transaction_lines (
      organization_id, transaction_id, line_number, item_id, variant_id,
      entered_quantity, entered_unit_id, conversion_multiplier, base_quantity,
      destination_location_id, destination_storage_area_id, destination_bin_id,
      unit_cost, purchase_order_line_id, lot_id
    ) values (
      v_po.organization_id, v_txn.id, v_line_number, v_line.item_id, v_line.variant_id,
      v_base_qty, v_item_base, 1, v_base_qty,
      v_dest_location, v_dest_area, v_dest_bin,
      v_unit_cost, v_line.id, v_lot_id
    );

    update public.purchase_order_lines
    set received_quantity = received_quantity + v_qty
    where id = v_line.id;
  end loop;

  v_txn := public.complete_inventory_transaction(v_txn.id);

  select
    exists (
      select 1 from public.purchase_order_lines
      where purchase_order_id = v_po.id and remaining_quantity > 0
    ),
    not exists (
      select 1 from public.purchase_order_lines
      where purchase_order_id = v_po.id and remaining_quantity > 0
    )
  into v_any_remaining, v_all_zero_remaining;

  if v_all_zero_remaining then
    update public.purchase_orders set status = 'received' where id = v_po.id;
  elsif v_any_remaining then
    update public.purchase_orders set status = 'partially_received' where id = v_po.id;
  end if;

  return v_txn;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS for lots
-- ---------------------------------------------------------------------------

alter table public.inventory_lots enable row level security;

grant select, insert, update on public.inventory_lots to authenticated;
grant all on public.inventory_lots to service_role;

create policy inventory_lots_select on public.inventory_lots for select to authenticated
using (private.user_has_permission(organization_id, 'inventory.lots.read'));

create policy inventory_lots_insert on public.inventory_lots for insert to authenticated
with check (private.user_has_permission(organization_id, 'inventory.lots.manage'));

create policy inventory_lots_update on public.inventory_lots for update to authenticated
using (private.user_has_permission(organization_id, 'inventory.lots.manage'))
with check (private.user_has_permission(organization_id, 'inventory.lots.manage'));

