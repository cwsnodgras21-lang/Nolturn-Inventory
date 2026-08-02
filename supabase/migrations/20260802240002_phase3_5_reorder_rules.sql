-- Phase 3.5: reorder rules and restock plan idempotency

create table public.reorder_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  location_id uuid references public.locations (id) on delete restrict,
  minimum_quantity numeric(20, 6) not null check (minimum_quantity >= 0),
  target_quantity numeric(20, 6) not null check (target_quantity >= 0),
  reorder_quantity numeric(20, 6) check (reorder_quantity is null or reorder_quantity > 0),
  preferred_supplier_id uuid references public.suppliers (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reorder_rules_target_gte_minimum check (target_quantity >= minimum_quantity)
);

create unique index reorder_rules_scope_uidx
  on public.reorder_rules (organization_id, item_id, variant_id, location_id)
  nulls not distinct;

create index reorder_rules_org_item_idx
  on public.reorder_rules (organization_id, item_id, status);

comment on table public.reorder_rules is
  'Default (location_id null) and location-specific reorder rules. Location rules override defaults.';

drop trigger if exists reorder_rules_set_updated_at on public.reorder_rules;
create trigger reorder_rules_set_updated_at
before update on public.reorder_rules
for each row execute function public.set_updated_at();

create or replace function private.enforce_reorder_rule_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_org uuid;
  v_variant_item uuid;
  v_variant_org uuid;
  v_location_org uuid;
  v_supplier_org uuid;
begin
  select organization_id into v_item_org from public.items where id = new.item_id;
  if v_item_org is null or v_item_org <> new.organization_id then
    raise exception 'reorder rule item must belong to the same organization';
  end if;

  if new.variant_id is not null then
    select item_id, organization_id into v_variant_item, v_variant_org
    from public.item_variants where id = new.variant_id;
    if v_variant_item is null or v_variant_item <> new.item_id then
      raise exception 'reorder rule variant must belong to the selected item';
    end if;
    if v_variant_org is null or v_variant_org <> new.organization_id then
      raise exception 'reorder rule variant must belong to the same organization';
    end if;
  end if;

  if new.location_id is not null then
    select organization_id into v_location_org from public.locations where id = new.location_id;
    if v_location_org is null or v_location_org <> new.organization_id then
      raise exception 'reorder rule location must belong to the same organization';
    end if;
  end if;

  if new.preferred_supplier_id is not null then
    select organization_id into v_supplier_org
    from public.suppliers where id = new.preferred_supplier_id;
    if v_supplier_org is null or v_supplier_org <> new.organization_id then
      raise exception 'preferred supplier must belong to the same organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reorder_rules_integrity on public.reorder_rules;
create trigger reorder_rules_integrity
before insert or update on public.reorder_rules
for each row execute function private.enforce_reorder_rule_integrity();

-- Idempotent restock → draft PO requests
create table public.restock_plan_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  request_key text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint restock_plan_requests_key_nonempty check (char_length(trim(request_key)) > 0)
);

create unique index restock_plan_requests_org_key_uidx
  on public.restock_plan_requests (organization_id, request_key);

create table public.restock_plan_request_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  request_id uuid not null references public.restock_plan_requests (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (request_id, purchase_order_id)
);

comment on table public.restock_plan_requests is
  'Idempotency keys for restock planning draft PO creation.';

-- RLS
alter table public.reorder_rules enable row level security;
alter table public.restock_plan_requests enable row level security;
alter table public.restock_plan_request_orders enable row level security;

grant select, insert, update, delete on public.reorder_rules to authenticated;
grant select, insert on public.restock_plan_requests to authenticated;
grant select, insert on public.restock_plan_request_orders to authenticated;
grant all on public.reorder_rules to service_role;
grant all on public.restock_plan_requests to service_role;
grant all on public.restock_plan_request_orders to service_role;

create policy reorder_rules_select on public.reorder_rules for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.reorder.read')
  and (
    location_id is null
    or private.user_can_access_location(organization_id, location_id)
  )
);

create policy reorder_rules_insert on public.reorder_rules for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.reorder.manage')
  and (
    location_id is null
    or private.user_can_access_location(organization_id, location_id)
  )
);

create policy reorder_rules_update on public.reorder_rules for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.reorder.manage')
  and (
    location_id is null
    or private.user_can_access_location(organization_id, location_id)
  )
)
with check (
  private.user_has_permission(organization_id, 'inventory.reorder.manage')
  and (
    location_id is null
    or private.user_can_access_location(organization_id, location_id)
  )
);

create policy reorder_rules_delete on public.reorder_rules for delete to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.reorder.manage')
  and (
    location_id is null
    or private.user_can_access_location(organization_id, location_id)
  )
);

create policy restock_plan_requests_select on public.restock_plan_requests for select to authenticated
using (private.user_has_permission(organization_id, 'inventory.reorder.read'));

create policy restock_plan_requests_insert on public.restock_plan_requests for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.reorder.manage')
  and private.user_has_permission(organization_id, 'purchasing.manage')
);

create policy restock_plan_request_orders_select on public.restock_plan_request_orders for select to authenticated
using (private.user_has_permission(organization_id, 'inventory.reorder.read'));

create policy restock_plan_request_orders_insert on public.restock_plan_request_orders for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.reorder.manage')
  and private.user_has_permission(organization_id, 'purchasing.manage')
);
