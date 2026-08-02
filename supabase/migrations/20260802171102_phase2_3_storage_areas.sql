-- Phase 2.3: storage areas (physical hierarchy; no quantities)

create table public.storage_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  parent_id uuid references public.storage_areas (id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  code text,
  area_type text not null check (
    area_type in (
      'room',
      'cabinet',
      'shelf',
      'refrigerator',
      'freezer',
      'closet',
      'warehouse',
      'other'
    )
  ),
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name_normalized text generated always as (lower(trim(name))) stored,
  code_normalized text generated always as (
    case when code is null or trim(code) = '' then null else lower(trim(code)) end
  ) stored,
  constraint storage_areas_parent_not_self check (parent_id is distinct from id)
);

comment on table public.storage_areas is
  'Physical storage hierarchy within a location. Quantities are not stored here.';

create unique index storage_areas_location_code_uidx
  on public.storage_areas (location_id, code_normalized)
  where code_normalized is not null;

create index storage_areas_organization_id_idx on public.storage_areas (organization_id);
create index storage_areas_location_id_idx on public.storage_areas (location_id);
create index storage_areas_parent_id_idx on public.storage_areas (parent_id);
create index storage_areas_org_status_idx on public.storage_areas (organization_id, status);

create trigger storage_areas_set_updated_at
before update on public.storage_areas
for each row execute function public.set_updated_at();

create or replace function private.prevent_storage_area_org_location_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'storage_areas.organization_id is immutable';
    end if;
    if new.location_id is distinct from old.location_id then
      raise exception 'storage_areas.location_id is immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger storage_areas_prevent_org_location_move
before update on public.storage_areas
for each row execute function private.prevent_storage_area_org_location_move();

-- Location must belong to the same organization as the storage area.
create or replace function private.enforce_storage_area_same_org_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc_org uuid;
begin
  select organization_id into loc_org from public.locations where id = new.location_id;
  if loc_org is null or loc_org <> new.organization_id then
    raise exception 'storage area location must belong to the same organization';
  end if;
  return new;
end;
$$;

create trigger storage_areas_same_org_location
before insert or update on public.storage_areas
for each row execute function private.enforce_storage_area_same_org_location();

-- Parent must share organization and location; no self-parent.
create or replace function private.enforce_storage_area_parent_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_org uuid;
  parent_loc uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'storage area cannot be its own parent';
  end if;

  select organization_id, location_id into parent_org, parent_loc
  from public.storage_areas
  where id = new.parent_id;

  if parent_org is null then
    raise exception 'parent storage area not found';
  end if;

  if parent_org <> new.organization_id then
    raise exception 'parent storage area must belong to the same organization';
  end if;

  if parent_loc <> new.location_id then
    raise exception 'parent storage area must belong to the same location';
  end if;

  return new;
end;
$$;

create trigger storage_areas_parent_rules
before insert or update on public.storage_areas
for each row execute function private.enforce_storage_area_parent_rules();

-- Cycle prevention (security definer so RLS does not truncate the walk).
create or replace function private.enforce_storage_area_no_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cursor_id uuid;
  depth int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'storage area cycle detected';
  end if;

  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'storage area cycle detected';
    end if;

    select parent_id into cursor_id
    from public.storage_areas
    where id = cursor_id;

    depth := depth + 1;
    if depth > 64 then
      raise exception 'storage area hierarchy too deep';
    end if;
  end loop;

  return new;
end;
$$;

create trigger storage_areas_no_cycle
before insert or update on public.storage_areas
for each row execute function private.enforce_storage_area_no_cycle();

grant select, insert, update on public.storage_areas to authenticated;
grant all on public.storage_areas to service_role;
