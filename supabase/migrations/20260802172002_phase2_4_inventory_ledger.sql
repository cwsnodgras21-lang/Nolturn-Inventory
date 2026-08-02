-- Phase 2.4: inventory ledger foundation (positive adjustment / opening balance only)

-- ---------------------------------------------------------------------------
-- Transaction number counters (concurrency-safe per organization)
-- ---------------------------------------------------------------------------

create table public.inventory_transaction_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0)
);

grant select, insert, update on public.inventory_transaction_counters to service_role;

-- ---------------------------------------------------------------------------
-- inventory_transactions
-- ---------------------------------------------------------------------------

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_number text not null,
  transaction_type text not null check (
    transaction_type in ('opening_balance', 'positive_adjustment')
  ),
  status text not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_transactions_completed_fields check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status <> 'completed')
  )
);

comment on table public.inventory_transactions is
  'Business inventory transaction headers. Phase 2.4 supports opening_balance and positive_adjustment only.';

create unique index inventory_transactions_org_number_uidx
  on public.inventory_transactions (organization_id, transaction_number);

create index inventory_transactions_organization_id_idx
  on public.inventory_transactions (organization_id);

create index inventory_transactions_org_status_idx
  on public.inventory_transactions (organization_id, status);

create trigger inventory_transactions_set_updated_at
before update on public.inventory_transactions
for each row execute function public.set_updated_at();

create or replace function private.prevent_inventory_transaction_org_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'inventory_transactions.organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger inventory_transactions_prevent_org_move
before update on public.inventory_transactions
for each row execute function private.prevent_inventory_transaction_org_move();

create or replace function private.enforce_inventory_transaction_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      raise exception 'completed inventory transactions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'completed' then
    raise exception 'completed inventory transactions cannot be edited';
  end if;

  if old.status = 'cancelled' and new.status is distinct from old.status then
    raise exception 'cancelled inventory transactions cannot change status';
  end if;

  if old.transaction_type is distinct from new.transaction_type then
    raise exception 'inventory transaction type is immutable';
  end if;

  if old.transaction_number is distinct from new.transaction_number then
    raise exception 'inventory transaction number is immutable';
  end if;

  return new;
end;
$$;

create trigger inventory_transactions_immutability
before update or delete on public.inventory_transactions
for each row execute function private.enforce_inventory_transaction_immutability();

-- ---------------------------------------------------------------------------
-- inventory_transaction_lines
-- ---------------------------------------------------------------------------

create table public.inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid not null references public.inventory_transactions (id) on delete cascade,
  line_number integer not null check (line_number > 0),
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  entered_quantity numeric not null check (entered_quantity > 0),
  entered_unit_id uuid not null references public.units_of_measure (id) on delete restrict,
  -- Draft may store a preview; completion always recalculates and overwrites.
  conversion_multiplier numeric not null default 1 check (conversion_multiplier > 0),
  base_quantity numeric not null check (base_quantity > 0),
  destination_location_id uuid not null references public.locations (id) on delete restrict,
  destination_storage_area_id uuid not null references public.storage_areas (id) on delete restrict,
  destination_bin_id uuid references public.storage_bins (id) on delete restrict,
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_transaction_lines_unique_line unique (transaction_id, line_number)
);

comment on table public.inventory_transaction_lines is
  'Entered inventory lines. Base quantity is recalculated server-side on completion.';

create index inventory_transaction_lines_transaction_id_idx
  on public.inventory_transaction_lines (transaction_id);

create index inventory_transaction_lines_organization_id_idx
  on public.inventory_transaction_lines (organization_id);

create trigger inventory_transaction_lines_set_updated_at
before update on public.inventory_transaction_lines
for each row execute function public.set_updated_at();

create or replace function private.enforce_inventory_line_draft_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  txn_status text;
begin
  if tg_op = 'DELETE' then
    select status into txn_status from public.inventory_transactions where id = old.transaction_id;
    if txn_status = 'completed' then
      raise exception 'completed inventory transaction lines cannot be deleted';
    end if;
    return old;
  end if;

  select status into txn_status from public.inventory_transactions where id = new.transaction_id;
  if txn_status is null then
    raise exception 'inventory transaction not found for line';
  end if;
  if txn_status = 'completed' then
    raise exception 'completed inventory transaction lines cannot be edited';
  end if;
  if txn_status = 'cancelled' then
    raise exception 'cancelled inventory transaction lines cannot be edited';
  end if;

  return new;
end;
$$;

create trigger inventory_transaction_lines_draft_only
before insert or update or delete on public.inventory_transaction_lines
for each row execute function private.enforce_inventory_line_draft_only();

create or replace function private.enforce_inventory_line_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  txn_org uuid;
  item_org uuid;
  item_requires boolean;
  item_base uuid;
  variant_item uuid;
  variant_org uuid;
  loc_org uuid;
  area_org uuid;
  area_loc uuid;
  bin_org uuid;
  bin_area uuid;
  unit_org uuid;
begin
  select organization_id into txn_org
  from public.inventory_transactions where id = new.transaction_id;

  if txn_org is null or txn_org <> new.organization_id then
    raise exception 'transaction line must belong to the same organization as its transaction';
  end if;

  select organization_id, requires_variant, base_unit_id
    into item_org, item_requires, item_base
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

  select organization_id into loc_org from public.locations where id = new.destination_location_id;
  if loc_org is null or loc_org <> new.organization_id then
    raise exception 'destination location must belong to the same organization';
  end if;

  select organization_id, location_id into area_org, area_loc
  from public.storage_areas where id = new.destination_storage_area_id;
  if area_org is null or area_org <> new.organization_id then
    raise exception 'destination storage area must belong to the same organization';
  end if;
  if area_loc <> new.destination_location_id then
    raise exception 'destination storage area must belong to the destination location';
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

  return new;
end;
$$;

create trigger inventory_transaction_lines_integrity
before insert or update on public.inventory_transaction_lines
for each row execute function private.enforce_inventory_line_integrity();

-- ---------------------------------------------------------------------------
-- inventory_ledger_entries (immutable)
-- ---------------------------------------------------------------------------

create table public.inventory_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid not null references public.inventory_transactions (id) on delete restrict,
  transaction_line_id uuid not null references public.inventory_transaction_lines (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  storage_area_id uuid not null references public.storage_areas (id) on delete restrict,
  bin_id uuid references public.storage_bins (id) on delete restrict,
  quantity_delta numeric not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint inventory_ledger_entries_line_unique unique (transaction_line_id)
);

comment on table public.inventory_ledger_entries is
  'Immutable signed quantity effects. Source of truth for stock. Never edit or delete.';

create index inventory_ledger_entries_org_item_idx
  on public.inventory_ledger_entries (organization_id, item_id);

create index inventory_ledger_entries_balance_dims_idx
  on public.inventory_ledger_entries (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id
  );

create or replace function private.forbid_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'inventory ledger entries are immutable';
end;
$$;

create trigger inventory_ledger_entries_no_update
before update on public.inventory_ledger_entries
for each row execute function private.forbid_ledger_mutation();

create trigger inventory_ledger_entries_no_delete
before delete on public.inventory_ledger_entries
for each row execute function private.forbid_ledger_mutation();

-- ---------------------------------------------------------------------------
-- inventory_balances (rebuildable projection)
-- ---------------------------------------------------------------------------

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  storage_area_id uuid not null references public.storage_areas (id) on delete restrict,
  bin_id uuid references public.storage_bins (id) on delete restrict,
  quantity_on_hand numeric not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_balances_dims_uidx unique nulls not distinct (
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id
  )
);

comment on table public.inventory_balances is
  'Rebuildable projection of on-hand quantity. Ledger is the source of truth.';

create index inventory_balances_organization_id_idx
  on public.inventory_balances (organization_id);

create index inventory_balances_org_item_idx
  on public.inventory_balances (organization_id, item_id);

create trigger inventory_balances_set_updated_at
before update on public.inventory_balances
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers: next transaction number, resolve conversion, apply balance delta
-- ---------------------------------------------------------------------------

create or replace function private.next_inventory_transaction_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next bigint;
begin
  insert into public.inventory_transaction_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.inventory_transaction_counters.last_number + 1
  returning last_number into v_next;

  return 'ADJ-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function private.resolve_item_conversion_multiplier(
  p_item_id uuid,
  p_entered_unit_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base uuid;
  v_multiplier numeric;
begin
  select base_unit_id into v_base from public.items where id = p_item_id;
  if v_base is null then
    raise exception 'item not found for conversion';
  end if;

  if p_entered_unit_id = v_base then
    return 1;
  end if;

  select multiplier into v_multiplier
  from public.item_unit_conversions
  where item_id = p_item_id
    and from_unit_id = p_entered_unit_id
    and to_unit_id = v_base;

  if v_multiplier is null then
    raise exception 'no conversion from entered unit to item base unit';
  end if;

  return v_multiplier;
end;
$$;

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
  on conflict (organization_id, item_id, variant_id, location_id, storage_area_id, bin_id)
  do update set
    quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand,
    updated_at = timezone('utc', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Complete transaction (atomic)
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
begin
  select * into v_txn
  from public.inventory_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'inventory transaction not found';
  end if;

  if not private.user_has_permission(v_txn.organization_id, 'inventory.adjust') then
    raise exception 'permission denied to complete inventory transaction';
  end if;

  if v_txn.status = 'completed' then
    raise exception 'inventory transaction already completed';
  end if;

  if v_txn.status <> 'draft' then
    raise exception 'only draft inventory transactions can be completed';
  end if;

  for v_line in
    select * from public.inventory_transaction_lines
    where transaction_id = v_txn.id
    order by line_number
    for update
  loop
    v_line_count := v_line_count + 1;

    if not private.user_can_access_location(v_line.destination_location_id) then
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
      occurred_at
    ) values (
      v_txn.organization_id,
      v_txn.id,
      v_line.id,
      v_line.item_id,
      v_line.variant_id,
      v_line.destination_location_id,
      v_line.destination_storage_area_id,
      v_line.destination_bin_id,
      v_base_qty,
      timezone('utc', now())
    );

    perform private.apply_inventory_balance_delta(
      v_txn.organization_id,
      v_line.item_id,
      v_line.variant_id,
      v_line.destination_location_id,
      v_line.destination_storage_area_id,
      v_line.destination_bin_id,
      v_base_qty
    );
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

revoke all on function public.complete_inventory_transaction(uuid) from public;
grant execute on function public.complete_inventory_transaction(uuid) to authenticated;
grant execute on function public.complete_inventory_transaction(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Rebuild balances from ledger
-- ---------------------------------------------------------------------------

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
    organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, quantity_on_hand
  )
  select
    organization_id,
    item_id,
    variant_id,
    location_id,
    storage_area_id,
    bin_id,
    sum(quantity_delta)
  from public.inventory_ledger_entries
  where organization_id = p_organization_id
  group by organization_id, item_id, variant_id, location_id, storage_area_id, bin_id
  having sum(quantity_delta) <> 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.rebuild_inventory_balances(uuid) from public;
grant execute on function public.rebuild_inventory_balances(uuid) to authenticated;
grant execute on function public.rebuild_inventory_balances(uuid) to service_role;

-- Allocate transaction number helper for inserts
create or replace function private.assign_inventory_transaction_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transaction_number is null or trim(new.transaction_number) = '' then
    new.transaction_number := private.next_inventory_transaction_number(new.organization_id);
  end if;
  return new;
end;
$$;

create trigger inventory_transactions_assign_number
before insert on public.inventory_transactions
for each row execute function private.assign_inventory_transaction_number();

grant select, insert, update on public.inventory_transactions to authenticated;
grant select, insert, update, delete on public.inventory_transaction_lines to authenticated;
grant select on public.inventory_ledger_entries to authenticated;
grant select on public.inventory_balances to authenticated;
grant all on public.inventory_transactions to service_role;
grant all on public.inventory_transaction_lines to service_role;
grant all on public.inventory_ledger_entries to service_role;
grant all on public.inventory_balances to service_role;
grant all on public.inventory_transaction_counters to service_role;
