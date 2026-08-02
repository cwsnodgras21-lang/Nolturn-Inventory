-- Phase 2.2: items (catalog master; no quantities)

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  category_id uuid references public.item_categories (id) on delete set null,
  base_unit_id uuid not null references public.units_of_measure (id) on delete restrict,
  default_entry_unit_id uuid not null references public.units_of_measure (id) on delete restrict,
  sku text not null check (char_length(trim(sku)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  requires_variant boolean not null default false,
  -- Future inventory: whether negative on-hand may be allowed. Not enforced until ledger exists.
  allow_negative_stock boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sku_normalized text generated always as (lower(trim(sku))) stored,
  name_normalized text generated always as (lower(trim(name))) stored
);

comment on table public.items is
  'Tenant catalog items. Quantities are not stored here. Once inventory transactions exist, base_unit_id must not be casually changed.';

comment on column public.items.base_unit_id is
  'Canonical unit for future ledger quantities. Future phase: lock after first inventory transaction.';

comment on column public.items.allow_negative_stock is
  'Reserved for future inventory policy. Unused in Phase 2.2.';

create unique index items_org_sku_normalized_uidx
  on public.items (organization_id, sku_normalized);

create index items_organization_id_idx on public.items (organization_id);
create index items_org_status_idx on public.items (organization_id, status);
create index items_category_id_idx on public.items (category_id);
create index items_name_normalized_idx on public.items (organization_id, name_normalized);

create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

create or replace function private.prevent_item_org_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'items.organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger items_prevent_org_move
before update on public.items
for each row execute function private.prevent_item_org_move();

-- Category + units must belong to the same organization as the item.
create or replace function private.enforce_item_same_org_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.units_of_measure where id = new.base_unit_id;
  if v_org is null or v_org <> new.organization_id then
    raise exception 'base unit must belong to the same organization';
  end if;

  select organization_id into v_org from public.units_of_measure where id = new.default_entry_unit_id;
  if v_org is null or v_org <> new.organization_id then
    raise exception 'default entry unit must belong to the same organization';
  end if;

  if new.category_id is not null then
    select organization_id into v_org from public.item_categories where id = new.category_id;
    if v_org is null or v_org <> new.organization_id then
      raise exception 'category must belong to the same organization';
    end if;
  end if;

  return new;
end;
$$;

create trigger items_same_org_refs
before insert or update on public.items
for each row execute function private.enforce_item_same_org_refs();

grant select, insert, update on public.items to authenticated;
grant all on public.items to service_role;
