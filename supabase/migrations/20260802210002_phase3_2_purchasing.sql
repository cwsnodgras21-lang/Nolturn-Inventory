-- Phase 3.2: suppliers, purchase orders, PO receiving via inventory receipts

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  email text,
  phone text,
  website text,
  account_number text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint suppliers_name_nonempty check (char_length(trim(name)) > 0)
);

create index suppliers_org_status_idx
  on public.suppliers (organization_id, status, name);

create unique index suppliers_org_name_uidx
  on public.suppliers (organization_id, lower(trim(name)));

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  title text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint supplier_contacts_name_nonempty check (char_length(trim(name)) > 0)
);

create index supplier_contacts_supplier_idx
  on public.supplier_contacts (supplier_id);

-- ---------------------------------------------------------------------------
-- Purchase order numbering
-- ---------------------------------------------------------------------------

create table public.purchase_order_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0)
);

create or replace function private.next_purchase_order_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next bigint;
begin
  insert into public.purchase_order_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.purchase_order_counters.last_number + 1
  returning last_number into v_next;

  return 'PO-' || lpad(v_next::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  po_number text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'partially_received', 'received', 'cancelled')),
  order_date date not null default (timezone('utc', now()))::date,
  expected_date date,
  ship_to_location_id uuid not null references public.locations (id) on delete restrict,
  external_reference text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_orders_submitted_fields check (
    (status in ('submitted', 'partially_received', 'received') and submitted_at is not null and submitted_by is not null)
    or (status in ('draft', 'cancelled'))
  ),
  constraint purchase_orders_cancelled_fields check (
    (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
    or (status <> 'cancelled')
  )
);

create unique index purchase_orders_org_number_uidx
  on public.purchase_orders (organization_id, po_number);

create index purchase_orders_org_status_idx
  on public.purchase_orders (organization_id, status, created_at desc);

create index purchase_orders_supplier_idx
  on public.purchase_orders (organization_id, supplier_id);

create index purchase_orders_ship_to_idx
  on public.purchase_orders (ship_to_location_id);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  line_number integer not null check (line_number > 0),
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  ordered_quantity numeric(20, 6) not null check (ordered_quantity > 0),
  purchase_unit_id uuid not null references public.units_of_measure (id) on delete restrict,
  conversion_multiplier numeric(20, 6) not null default 1 check (conversion_multiplier > 0),
  unit_cost numeric(20, 6) check (unit_cost is null or unit_cost >= 0),
  received_quantity numeric(20, 6) not null default 0 check (received_quantity >= 0),
  remaining_quantity numeric(20, 6) generated always as (ordered_quantity - received_quantity) stored,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (purchase_order_id, line_number),
  constraint purchase_order_lines_received_lte_ordered check (received_quantity <= ordered_quantity)
);

create index purchase_order_lines_po_idx
  on public.purchase_order_lines (purchase_order_id);

comment on table public.suppliers is
  'Tenant-owned suppliers. Soft status; no hard delete in app flows.';
comment on table public.purchase_orders is
  'Purchase orders. Receiving posts normal inventory receipt transactions.';
comment on column public.purchase_order_lines.conversion_multiplier is
  'Frozen purchase-unit → base multiplier; historical meaning preserved after submit.';
comment on column public.purchase_order_lines.remaining_quantity is
  'ordered_quantity - received_quantity in purchase units.';

-- Link inventory receipts to POs
alter table public.inventory_transactions
  add column if not exists purchase_order_id uuid references public.purchase_orders (id) on delete set null;

create index if not exists inventory_transactions_po_idx
  on public.inventory_transactions (purchase_order_id)
  where purchase_order_id is not null;

alter table public.inventory_transaction_lines
  add column if not exists purchase_order_line_id uuid references public.purchase_order_lines (id) on delete set null;

create index if not exists inventory_transaction_lines_po_line_idx
  on public.inventory_transaction_lines (purchase_order_line_id)
  where purchase_order_line_id is not null;

comment on column public.inventory_transactions.purchase_order_id is
  'Optional link when receipt was posted from purchase order receiving.';
comment on column public.inventory_transaction_lines.purchase_order_line_id is
  'Optional PO line that this receipt line fulfills.';

-- ---------------------------------------------------------------------------
-- Triggers / integrity
-- ---------------------------------------------------------------------------

create or replace function private.assign_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.po_number is null or trim(new.po_number) = '' then
    new.po_number := private.next_purchase_order_number(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_assign_number on public.purchase_orders;
create trigger purchase_orders_assign_number
before insert on public.purchase_orders
for each row execute function private.assign_purchase_order_number();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists supplier_contacts_set_updated_at on public.supplier_contacts;
create trigger supplier_contacts_set_updated_at
before update on public.supplier_contacts
for each row execute function public.set_updated_at();

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

drop trigger if exists purchase_order_lines_set_updated_at on public.purchase_order_lines;
create trigger purchase_order_lines_set_updated_at
before update on public.purchase_order_lines
for each row execute function public.set_updated_at();

create or replace function private.enforce_supplier_contact_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_org uuid;
begin
  select organization_id into v_supplier_org
  from public.suppliers where id = new.supplier_id;

  if v_supplier_org is null or v_supplier_org <> new.organization_id then
    raise exception 'supplier contact must belong to the same organization as its supplier';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_contacts_integrity on public.supplier_contacts;
create trigger supplier_contacts_integrity
before insert or update on public.supplier_contacts
for each row execute function private.enforce_supplier_contact_integrity();

create or replace function private.enforce_purchase_order_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_org uuid;
  v_supplier_status text;
  v_location_org uuid;
begin
  select organization_id, status into v_supplier_org, v_supplier_status
  from public.suppliers where id = new.supplier_id;

  if v_supplier_org is null or v_supplier_org <> new.organization_id then
    raise exception 'purchase order supplier must belong to the same organization';
  end if;

  if tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id then
    if v_supplier_status <> 'active' then
      raise exception 'purchase order supplier must be active';
    end if;
  end if;

  select organization_id into v_location_org
  from public.locations where id = new.ship_to_location_id;

  if v_location_org is null or v_location_org <> new.organization_id then
    raise exception 'ship-to location must belong to the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_orders_integrity on public.purchase_orders;
create trigger purchase_orders_integrity
before insert or update on public.purchase_orders
for each row execute function private.enforce_purchase_order_integrity();

create or replace function private.enforce_purchase_order_line_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_item_org uuid;
  v_requires boolean;
  v_variant_item uuid;
  v_variant_org uuid;
  v_unit_org uuid;
  v_multiplier numeric;
begin
  select * into v_po from public.purchase_orders where id = new.purchase_order_id;
  if v_po.id is null or v_po.organization_id <> new.organization_id then
    raise exception 'purchase order line must belong to the same organization as its order';
  end if;

  if tg_op = 'INSERT' and v_po.status <> 'draft' then
    raise exception 'lines can only be added to draft purchase orders';
  end if;

  -- After submit, only received_quantity may change (receive RPC).
  if tg_op = 'UPDATE' and v_po.status <> 'draft' then
    if new.item_id is distinct from old.item_id
      or new.variant_id is distinct from old.variant_id
      or new.ordered_quantity is distinct from old.ordered_quantity
      or new.purchase_unit_id is distinct from old.purchase_unit_id
      or new.conversion_multiplier is distinct from old.conversion_multiplier
      or new.unit_cost is distinct from old.unit_cost
      or new.notes is distinct from old.notes
      or new.line_number is distinct from old.line_number
      or new.organization_id is distinct from old.organization_id
      or new.purchase_order_id is distinct from old.purchase_order_id then
      raise exception 'only draft purchase order lines can be edited';
    end if;
  end if;

  select organization_id, requires_variant into v_item_org, v_requires
  from public.items where id = new.item_id;
  if v_item_org is null or v_item_org <> new.organization_id then
    raise exception 'purchase order line item must belong to the same organization';
  end if;
  if v_requires and new.variant_id is null then
    raise exception 'item requires a variant';
  end if;

  if new.variant_id is not null then
    select item_id, organization_id into v_variant_item, v_variant_org
    from public.item_variants where id = new.variant_id;
    if v_variant_item is null or v_variant_item <> new.item_id then
      raise exception 'variant must belong to the selected item';
    end if;
    if v_variant_org is null or v_variant_org <> new.organization_id then
      raise exception 'variant must belong to the same organization';
    end if;
  end if;

  select organization_id into v_unit_org
  from public.units_of_measure where id = new.purchase_unit_id;
  if v_unit_org is null or v_unit_org <> new.organization_id then
    raise exception 'purchase unit must belong to the same organization';
  end if;

  -- Freeze / refresh conversion while draft
  if v_po.status = 'draft' and (
    tg_op = 'INSERT'
    or new.item_id is distinct from old.item_id
    or new.purchase_unit_id is distinct from old.purchase_unit_id
    or new.conversion_multiplier is distinct from old.conversion_multiplier
  ) then
    v_multiplier := private.resolve_item_conversion_multiplier(new.item_id, new.purchase_unit_id);
    new.conversion_multiplier := v_multiplier;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_order_lines_integrity on public.purchase_order_lines;
create trigger purchase_order_lines_integrity
before insert or update on public.purchase_order_lines
for each row execute function private.enforce_purchase_order_line_integrity();

create or replace function private.enforce_purchase_order_line_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.purchase_orders where id = old.purchase_order_id;
  if v_status is distinct from 'draft' then
    raise exception 'only draft purchase order lines can be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists purchase_order_lines_delete_guard on public.purchase_order_lines;
create trigger purchase_order_lines_delete_guard
before delete on public.purchase_order_lines
for each row execute function private.enforce_purchase_order_line_delete();

create or replace function private.enforce_purchase_order_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'purchase orders cannot be deleted';
  end if;

  if old.status in ('received', 'cancelled') then
    raise exception 'completed or cancelled purchase orders are immutable';
  end if;

  if old.status in ('submitted', 'partially_received') then
    if new.supplier_id is distinct from old.supplier_id
      or new.po_number is distinct from old.po_number
      or new.order_date is distinct from old.order_date
      or new.ship_to_location_id is distinct from old.ship_to_location_id
      or new.organization_id is distinct from old.organization_id then
      raise exception 'submitted purchase order identity fields are immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_orders_immutability on public.purchase_orders;
create trigger purchase_orders_immutability
before update or delete on public.purchase_orders
for each row execute function private.enforce_purchase_order_immutability();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_counters enable row level security;

grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update, delete on public.supplier_contacts to authenticated;
grant select, insert, update on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;
grant all on public.suppliers to service_role;
grant all on public.supplier_contacts to service_role;
grant all on public.purchase_orders to service_role;
grant all on public.purchase_order_lines to service_role;
grant all on public.purchase_order_counters to service_role;

create policy purchase_order_counters_deny on public.purchase_order_counters
for all to authenticated using (false) with check (false);

-- Suppliers
create policy suppliers_select on public.suppliers for select to authenticated
using (private.user_has_permission(organization_id, 'purchasing.read'));

create policy suppliers_insert on public.suppliers for insert to authenticated
with check (private.user_has_permission(organization_id, 'purchasing.manage'));

create policy suppliers_update on public.suppliers for update to authenticated
using (private.user_has_permission(organization_id, 'purchasing.manage'))
with check (private.user_has_permission(organization_id, 'purchasing.manage'));

create policy supplier_contacts_select on public.supplier_contacts for select to authenticated
using (private.user_has_permission(organization_id, 'purchasing.read'));

create policy supplier_contacts_insert on public.supplier_contacts for insert to authenticated
with check (private.user_has_permission(organization_id, 'purchasing.manage'));

create policy supplier_contacts_update on public.supplier_contacts for update to authenticated
using (private.user_has_permission(organization_id, 'purchasing.manage'))
with check (private.user_has_permission(organization_id, 'purchasing.manage'));

create policy supplier_contacts_delete on public.supplier_contacts for delete to authenticated
using (private.user_has_permission(organization_id, 'purchasing.manage'));

-- Purchase orders — inline location scope (avoid SELECT helper recursion)
create policy purchase_orders_select on public.purchase_orders for select to authenticated
using (
  private.user_has_permission(organization_id, 'purchasing.read')
  and private.user_can_access_location(ship_to_location_id)
);

create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'purchasing.manage')
  and status = 'draft'
  and private.user_can_access_location(ship_to_location_id)
);

create policy purchase_orders_update on public.purchase_orders for update to authenticated
using (
  private.user_has_permission(organization_id, 'purchasing.manage')
  or private.user_has_permission(organization_id, 'purchasing.receive')
)
with check (
  private.user_has_permission(organization_id, 'purchasing.manage')
  or private.user_has_permission(organization_id, 'purchasing.receive')
);

create policy purchase_order_lines_select on public.purchase_order_lines for select to authenticated
using (
  private.user_has_permission(organization_id, 'purchasing.read')
  and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id
      and private.user_can_access_location(po.ship_to_location_id)
  )
);

create policy purchase_order_lines_insert on public.purchase_order_lines for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'purchasing.manage')
  and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id
      and po.status = 'draft'
      and private.user_can_access_location(po.ship_to_location_id)
  )
);

create policy purchase_order_lines_update on public.purchase_order_lines for update to authenticated
using (
  private.user_has_permission(organization_id, 'purchasing.manage')
  or private.user_has_permission(organization_id, 'purchasing.receive')
)
with check (
  private.user_has_permission(organization_id, 'purchasing.manage')
  or private.user_has_permission(organization_id, 'purchasing.receive')
);

create policy purchase_order_lines_delete on public.purchase_order_lines for delete to authenticated
using (
  private.user_has_permission(organization_id, 'purchasing.manage')
  and exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id and po.status = 'draft'
  )
);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.submit_purchase_order(p_purchase_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_line_count integer;
begin
  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if v_po.id is null then
    raise exception 'purchase order not found';
  end if;
  if not private.user_has_permission(v_po.organization_id, 'purchasing.manage') then
    raise exception 'permission denied';
  end if;
  if not private.user_can_access_location(v_po.ship_to_location_id) then
    raise exception 'ship-to location is not accessible';
  end if;
  if v_po.status <> 'draft' then
    raise exception 'only draft purchase orders can be submitted';
  end if;

  select count(*) into v_line_count
  from public.purchase_order_lines
  where purchase_order_id = v_po.id;
  if v_line_count < 1 then
    raise exception 'purchase order must have at least one line';
  end if;

  update public.purchase_orders
  set status = 'submitted',
      submitted_by = auth.uid(),
      submitted_at = timezone('utc', now())
  where id = v_po.id
  returning * into v_po;

  return v_po;
end;
$$;

create or replace function public.cancel_purchase_order(p_purchase_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_received numeric;
begin
  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if v_po.id is null then
    raise exception 'purchase order not found';
  end if;
  if not private.user_has_permission(v_po.organization_id, 'purchasing.manage') then
    raise exception 'permission denied';
  end if;
  if v_po.status not in ('draft', 'submitted') then
    raise exception 'only draft or submitted purchase orders with no receipts can be cancelled';
  end if;

  select coalesce(sum(received_quantity), 0) into v_received
  from public.purchase_order_lines
  where purchase_order_id = v_po.id;
  if v_received > 0 then
    raise exception 'purchase orders with receipts cannot be cancelled';
  end if;

  update public.purchase_orders
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = timezone('utc', now())
  where id = v_po.id
  returning * into v_po;

  return v_po;
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
    organization_id,
    transaction_type,
    status,
    transaction_number,
    notes,
    reference_text,
    purchase_order_id,
    created_by
  ) values (
    v_po.organization_id,
    'receipt',
    'draft',
    '',
    coalesce(p_notes, 'Receipt against ' || v_po.po_number),
    p_reference_text,
    v_po.id,
    auth.uid()
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

    select base_unit_id into v_item_base from public.items where id = v_line.item_id;
    v_base_qty := v_qty * v_line.conversion_multiplier;

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
      unit_cost,
      purchase_order_line_id
    ) values (
      v_po.organization_id,
      v_txn.id,
      v_line_number,
      v_line.item_id,
      v_line.variant_id,
      v_base_qty,
      v_item_base,
      1,
      v_base_qty,
      v_dest_location,
      v_dest_area,
      v_dest_bin,
      v_unit_cost,
      v_line.id
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
    update public.purchase_orders
    set status = 'received'
    where id = v_po.id;
  elsif v_any_remaining then
    update public.purchase_orders
    set status = 'partially_received'
    where id = v_po.id;
  end if;

  return v_txn;
end;
$$;

grant execute on function public.submit_purchase_order(uuid) to authenticated;
grant execute on function public.submit_purchase_order(uuid) to service_role;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid) to service_role;
grant execute on function public.receive_purchase_order(uuid, jsonb, text, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb, text, text) to service_role;
