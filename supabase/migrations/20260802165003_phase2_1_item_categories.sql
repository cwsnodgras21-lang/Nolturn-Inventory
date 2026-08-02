-- Phase 2.1: item categories with hierarchy + cycle prevention

create table public.item_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  parent_id uuid references public.item_categories (id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name_normalized text generated always as (lower(trim(name))) stored,
  constraint item_categories_parent_not_self check (parent_id is distinct from id)
);

-- Sibling uniqueness (roots share parent_id null via coalesce sentinel)
create unique index item_categories_sibling_name_uidx
  on public.item_categories (
    organization_id,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    name_normalized
  );

create index item_categories_organization_id_idx
  on public.item_categories (organization_id);

create index item_categories_parent_id_idx
  on public.item_categories (parent_id);

create trigger item_categories_set_updated_at
before update on public.item_categories
for each row execute function public.set_updated_at();

create or replace function private.prevent_category_org_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'item_categories.organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger item_categories_prevent_org_move
before update on public.item_categories
for each row execute function private.prevent_category_org_move();

-- Ensure parent belongs to same organization (needed because RLS alone is not enough on write paths).
create or replace function private.enforce_category_parent_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_org uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'category cannot be its own parent';
  end if;

  select organization_id into parent_org
  from public.item_categories
  where id = new.parent_id;

  if parent_org is null then
    raise exception 'parent category not found';
  end if;

  if parent_org <> new.organization_id then
    raise exception 'parent category must belong to the same organization';
  end if;

  return new;
end;
$$;

create trigger item_categories_parent_same_org
before insert or update on public.item_categories
for each row execute function private.enforce_category_parent_same_org();

-- Cycle prevention: walking ancestors from the proposed parent must not reach the row itself.
-- security definer so the walk is not truncated by RLS when validating hierarchy integrity.
create or replace function private.enforce_category_no_cycle()
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
    raise exception 'category cycle detected';
  end if;

  -- On insert, id already assigned (default uuid). Walk from parent upward.
  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'category cycle detected';
    end if;

    select parent_id into cursor_id
    from public.item_categories
    where id = cursor_id;

    depth := depth + 1;
    if depth > 64 then
      raise exception 'category hierarchy too deep';
    end if;
  end loop;

  return new;
end;
$$;

create trigger item_categories_no_cycle
before insert or update of parent_id, id on public.item_categories
for each row execute function private.enforce_category_no_cycle();

comment on table public.item_categories is
  'Tenant-owned hierarchical item categories. Cycles and cross-org parents are rejected.';

comment on function private.enforce_category_no_cycle() is
  'SECURITY DEFINER with empty search_path: validates ancestor chain without RLS truncation. Does not return tenant rows to callers.';

grant select, insert, update on public.item_categories to authenticated;
grant all on public.item_categories to service_role;
