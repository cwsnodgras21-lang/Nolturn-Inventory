-- Phase 2.2: variants, item unit conversions, identifiers

-- ---------------------------------------------------------------------------
-- item_variants
-- ---------------------------------------------------------------------------

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  sku text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name_normalized text generated always as (lower(trim(name))) stored,
  sku_normalized text generated always as (
    case when sku is null or trim(sku) = '' then null else lower(trim(sku)) end
  ) stored
);

create unique index item_variants_item_name_uidx
  on public.item_variants (item_id, name_normalized);

create unique index item_variants_org_sku_uidx
  on public.item_variants (organization_id, sku_normalized)
  where sku_normalized is not null;

create index item_variants_item_id_idx on public.item_variants (item_id);
create index item_variants_organization_id_idx on public.item_variants (organization_id);

create trigger item_variants_set_updated_at
before update on public.item_variants
for each row execute function public.set_updated_at();

create or replace function private.prevent_variant_org_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'item_variants.organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger item_variants_prevent_org_move
before update on public.item_variants
for each row execute function private.prevent_variant_org_move();

create or replace function private.enforce_variant_same_org_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_org uuid;
begin
  select organization_id into item_org from public.items where id = new.item_id;
  if item_org is null or item_org <> new.organization_id then
    raise exception 'variant item must belong to the same organization';
  end if;
  return new;
end;
$$;

create trigger item_variants_same_org_item
before insert or update on public.item_variants
for each row execute function private.enforce_variant_same_org_item();

-- ---------------------------------------------------------------------------
-- item_unit_conversions (direct to base unit only)
-- ---------------------------------------------------------------------------

create table public.item_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  from_unit_id uuid not null references public.units_of_measure (id) on delete restrict,
  to_unit_id uuid not null references public.units_of_measure (id) on delete restrict,
  multiplier numeric not null check (multiplier > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint item_unit_conversions_no_self check (from_unit_id <> to_unit_id),
  constraint item_unit_conversions_pair_unique unique (item_id, from_unit_id, to_unit_id)
);

comment on table public.item_unit_conversions is
  'Item-specific conversions. Phase 2.2 requires to_unit_id = item.base_unit_id (no chain traversal).';

create index item_unit_conversions_item_id_idx on public.item_unit_conversions (item_id);
create index item_unit_conversions_organization_id_idx on public.item_unit_conversions (organization_id);

create trigger item_unit_conversions_set_updated_at
before update on public.item_unit_conversions
for each row execute function public.set_updated_at();

create or replace function private.enforce_item_unit_conversion_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_org uuid;
  item_base uuid;
  from_org uuid;
  to_org uuid;
begin
  select organization_id, base_unit_id into item_org, item_base
  from public.items where id = new.item_id;

  if item_org is null or item_org <> new.organization_id then
    raise exception 'conversion item must belong to the same organization';
  end if;

  if new.to_unit_id is distinct from item_base then
    raise exception 'conversion to_unit_id must equal the item base unit';
  end if;

  select organization_id into from_org from public.units_of_measure where id = new.from_unit_id;
  select organization_id into to_org from public.units_of_measure where id = new.to_unit_id;

  if from_org is null or from_org <> new.organization_id then
    raise exception 'from unit must belong to the same organization';
  end if;
  if to_org is null or to_org <> new.organization_id then
    raise exception 'to unit must belong to the same organization';
  end if;

  return new;
end;
$$;

create trigger item_unit_conversions_rules
before insert or update on public.item_unit_conversions
for each row execute function private.enforce_item_unit_conversion_rules();

-- ---------------------------------------------------------------------------
-- item_identifiers
-- ---------------------------------------------------------------------------

create table public.item_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  variant_id uuid references public.item_variants (id) on delete cascade,
  identifier_type text not null check (
    identifier_type in ('barcode', 'upc', 'ean', 'manufacturer_code', 'internal_code')
  ),
  value_display text not null check (char_length(trim(value_display)) > 0),
  value_normalized text generated always as (
    lower(regexp_replace(trim(value_display), '\s+', '', 'g'))
  ) stored,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index item_identifiers_org_value_uidx
  on public.item_identifiers (organization_id, value_normalized);

create unique index item_identifiers_primary_item_uidx
  on public.item_identifiers (item_id)
  where is_primary and variant_id is null;

create unique index item_identifiers_primary_variant_uidx
  on public.item_identifiers (item_id, variant_id)
  where is_primary and variant_id is not null;

create index item_identifiers_item_id_idx on public.item_identifiers (item_id);
create index item_identifiers_organization_id_idx on public.item_identifiers (organization_id);

create trigger item_identifiers_set_updated_at
before update on public.item_identifiers
for each row execute function public.set_updated_at();

create or replace function private.enforce_item_identifier_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_org uuid;
  variant_item uuid;
  variant_org uuid;
begin
  select organization_id into item_org from public.items where id = new.item_id;
  if item_org is null or item_org <> new.organization_id then
    raise exception 'identifier item must belong to the same organization';
  end if;

  if new.variant_id is not null then
    select item_id, organization_id into variant_item, variant_org
    from public.item_variants where id = new.variant_id;

    if variant_item is null or variant_item <> new.item_id then
      raise exception 'identifier variant must belong to the selected item';
    end if;
    if variant_org is null or variant_org <> new.organization_id then
      raise exception 'identifier variant must belong to the same organization';
    end if;
  end if;

  return new;
end;
$$;

create trigger item_identifiers_rules
before insert or update on public.item_identifiers
for each row execute function private.enforce_item_identifier_rules();

grant select, insert, update on public.item_variants to authenticated;
grant select, insert, update, delete on public.item_unit_conversions to authenticated;
grant select, insert, update, delete on public.item_identifiers to authenticated;
grant all on public.item_variants to service_role;
grant all on public.item_unit_conversions to service_role;
grant all on public.item_identifiers to service_role;
