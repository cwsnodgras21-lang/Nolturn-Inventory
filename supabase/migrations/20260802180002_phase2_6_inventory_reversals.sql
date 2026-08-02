-- Phase 2.6: reversals, draft location hardening, reconciliation

-- ---------------------------------------------------------------------------
-- Header: reversal type, status, bidirectional links
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
      'transfer',
      'reversal'
    )
  );

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_status_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_status_check check (
    status in ('draft', 'completed', 'cancelled', 'reversed')
  );

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_completed_fields;

alter table public.inventory_transactions
  add constraint inventory_transactions_completed_fields check (
    (
      status in ('completed', 'reversed')
      and completed_at is not null
      and completed_by is not null
    )
    or (status not in ('completed', 'reversed'))
  );

alter table public.inventory_transactions
  add column if not exists reverses_transaction_id uuid
    references public.inventory_transactions (id) on delete restrict;

alter table public.inventory_transactions
  add column if not exists reversed_by_transaction_id uuid
    references public.inventory_transactions (id) on delete restrict;

create unique index if not exists inventory_transactions_reverses_uidx
  on public.inventory_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;

create unique index if not exists inventory_transactions_reversed_by_uidx
  on public.inventory_transactions (reversed_by_transaction_id)
  where reversed_by_transaction_id is not null;

comment on column public.inventory_transactions.reverses_transaction_id is
  'When set, this transaction is a reversal of the referenced original.';
comment on column public.inventory_transactions.reversed_by_transaction_id is
  'When set, this original transaction was reversed by the referenced reversal.';

-- ---------------------------------------------------------------------------
-- Numbering: REV- prefix
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
    when 'reversal' then 'REV-'
    else 'ADJ-'
  end;

  return v_prefix || lpad(v_next::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Line integrity: reversal lines mirror original sides (source and/or dest)
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
  elsif txn_type = 'reversal' then
    if not has_source and not has_dest then
      raise exception 'reversal lines require source or destination storage';
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
-- Immutability: allow completed → reversed linking only
-- ---------------------------------------------------------------------------

create or replace function private.enforce_inventory_transaction_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('completed', 'reversed') then
      raise exception 'completed inventory transactions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'reversed' then
    raise exception 'reversed inventory transactions cannot be edited';
  end if;

  if old.status = 'completed' then
    -- Controlled transition used only by reverse_inventory_transaction.
    if new.status = 'reversed'
      and new.reversed_by_transaction_id is not null
      and old.reversed_by_transaction_id is null
      and new.organization_id is not distinct from old.organization_id
      and new.transaction_type is not distinct from old.transaction_type
      and new.transaction_number is not distinct from old.transaction_number
      and new.reverses_transaction_id is not distinct from old.reverses_transaction_id
      and new.created_by is not distinct from old.created_by
      and new.completed_by is not distinct from old.completed_by
      and new.completed_at is not distinct from old.completed_at
      and new.notes is not distinct from old.notes
      and new.reference_text is not distinct from old.reference_text
    then
      return new;
    end if;
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

  if old.reverses_transaction_id is distinct from new.reverses_transaction_id
    and old.reverses_transaction_id is not null then
    raise exception 'reversal links cannot be altered';
  end if;

  if old.reversed_by_transaction_id is distinct from new.reversed_by_transaction_id
    and old.reversed_by_transaction_id is not null then
    raise exception 'reversal links cannot be altered';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_inventory_line_draft_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.inventory_transactions
  where id = coalesce(new.transaction_id, old.transaction_id);

  if v_status in ('completed', 'cancelled', 'reversed') then
    raise exception 'completed inventory transaction lines cannot be edited';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft location hardening (RLS)
-- ---------------------------------------------------------------------------

drop policy if exists inventory_transaction_lines_insert on public.inventory_transaction_lines;
drop policy if exists inventory_transaction_lines_update on public.inventory_transaction_lines;

create policy inventory_transaction_lines_insert on public.inventory_transaction_lines for insert to authenticated
with check (
  (
    private.user_has_permission(organization_id, 'inventory.adjust')
    or private.user_has_permission(organization_id, 'inventory.receive')
    or private.user_has_permission(organization_id, 'inventory.consume')
    or private.user_has_permission(organization_id, 'inventory.transfer')
  )
  and (
    destination_location_id is null
    or private.user_can_access_location(destination_location_id)
  )
  and (
    source_location_id is null
    or private.user_can_access_location(source_location_id)
  )
);

create policy inventory_transaction_lines_update on public.inventory_transaction_lines for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.adjust')
  or private.user_has_permission(organization_id, 'inventory.receive')
  or private.user_has_permission(organization_id, 'inventory.consume')
  or private.user_has_permission(organization_id, 'inventory.transfer')
)
with check (
  (
    private.user_has_permission(organization_id, 'inventory.adjust')
    or private.user_has_permission(organization_id, 'inventory.receive')
    or private.user_has_permission(organization_id, 'inventory.consume')
    or private.user_has_permission(organization_id, 'inventory.transfer')
  )
  and (
    destination_location_id is null
    or private.user_can_access_location(destination_location_id)
  )
  and (
    source_location_id is null
    or private.user_can_access_location(source_location_id)
  )
);

-- Header RLS: tenants cannot create reversal rows or set link columns directly.
-- reverse_inventory_transaction is security definer and bypasses these checks.
drop policy if exists inventory_transactions_insert on public.inventory_transactions;
drop policy if exists inventory_transactions_update on public.inventory_transactions;

create policy inventory_transactions_insert on public.inventory_transactions for insert to authenticated
with check (
  status = 'draft'
  and transaction_type <> 'reversal'
  and reverses_transaction_id is null
  and reversed_by_transaction_id is null
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
  and reverses_transaction_id is null
  and reversed_by_transaction_id is null
  and transaction_type <> 'reversal'
  and (
    private.user_has_permission(organization_id, 'inventory.adjust')
    or private.user_has_permission(organization_id, 'inventory.receive')
    or private.user_has_permission(organization_id, 'inventory.consume')
    or private.user_has_permission(organization_id, 'inventory.transfer')
  )
);

-- ---------------------------------------------------------------------------
-- Reverse RPC
-- ---------------------------------------------------------------------------

create or replace function public.reverse_inventory_transaction(
  p_transaction_id uuid,
  p_reason text
)
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

  -- Location access for every original ledger location.
  for v_entry in
    select distinct on (location_id) *
    from public.inventory_ledger_entries
    where transaction_id = v_original.id
  loop
    if not private.user_can_access_location(v_entry.location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  -- Stock checks for every inverse debit (original credit → reversal debit).
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
        v_entry.quantity_delta
      );
    end if;
  end loop;

  -- Create as draft so mirrored lines can be inserted, then complete atomically.
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

  -- Mirror original lines using stored quantities (no conversion recalculation).
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
      v_line.unit_cost,
      v_line.notes
    );
  end loop;

  -- Exact inverse ledger postings keyed to mirrored lines by line_number + effect_role.
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

revoke all on function public.reverse_inventory_transaction(uuid, text) from public;
grant execute on function public.reverse_inventory_transaction(uuid, text) to authenticated;
grant execute on function public.reverse_inventory_transaction(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reconciliation: projection vs ledger sum
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_inventory_balances(p_organization_id uuid)
returns table (
  item_id uuid,
  variant_id uuid,
  location_id uuid,
  storage_area_id uuid,
  bin_id uuid,
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
      sum(e.quantity_delta)::numeric as ledger_quantity
    from public.inventory_ledger_entries e
    where e.organization_id = p_organization_id
    group by e.item_id, e.variant_id, e.location_id, e.storage_area_id, e.bin_id
  ),
  balances as (
    select
      b.item_id,
      b.variant_id,
      b.location_id,
      b.storage_area_id,
      b.bin_id,
      b.quantity_on_hand::numeric as balance_quantity
    from public.inventory_balances b
    where b.organization_id = p_organization_id
  )
  select
    coalesce(b.item_id, l.item_id) as item_id,
    coalesce(b.variant_id, l.variant_id) as variant_id,
    coalesce(b.location_id, l.location_id) as location_id,
    coalesce(b.storage_area_id, l.storage_area_id) as storage_area_id,
    coalesce(b.bin_id, l.bin_id) as bin_id,
    coalesce(b.balance_quantity, 0) as balance_quantity,
    coalesce(l.ledger_quantity, 0) as ledger_quantity,
    coalesce(b.balance_quantity, 0) - coalesce(l.ledger_quantity, 0) as difference
  from balances b
  full outer join ledger l
    on b.item_id = l.item_id
   and b.variant_id is not distinct from l.variant_id
   and b.location_id = l.location_id
   and b.storage_area_id = l.storage_area_id
   and b.bin_id is not distinct from l.bin_id
  where coalesce(b.balance_quantity, 0) is distinct from coalesce(l.ledger_quantity, 0);
end;
$$;

revoke all on function public.reconcile_inventory_balances(uuid) from public;
grant execute on function public.reconcile_inventory_balances(uuid) to authenticated;
grant execute on function public.reconcile_inventory_balances(uuid) to service_role;
