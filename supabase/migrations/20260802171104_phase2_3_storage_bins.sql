-- Phase 2.3: optional storage bins

create table public.storage_bins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  storage_area_id uuid not null references public.storage_areas (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  code text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name_normalized text generated always as (lower(trim(name))) stored,
  code_normalized text generated always as (
    case when code is null or trim(code) = '' then null else lower(trim(code)) end
  ) stored
);

comment on table public.storage_bins is
  'Optional bins within a storage area. Inventory may later exist at area level without a bin.';

create unique index storage_bins_area_code_uidx
  on public.storage_bins (storage_area_id, code_normalized)
  where code_normalized is not null;

create index storage_bins_organization_id_idx on public.storage_bins (organization_id);
create index storage_bins_storage_area_id_idx on public.storage_bins (storage_area_id);

create trigger storage_bins_set_updated_at
before update on public.storage_bins
for each row execute function public.set_updated_at();

create or replace function private.prevent_storage_bin_org_area_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'storage_bins.organization_id is immutable';
    end if;
    if new.storage_area_id is distinct from old.storage_area_id then
      raise exception 'storage_bins.storage_area_id is immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger storage_bins_prevent_org_area_move
before update on public.storage_bins
for each row execute function private.prevent_storage_bin_org_area_move();

create or replace function private.enforce_storage_bin_same_org_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  area_org uuid;
begin
  select organization_id into area_org
  from public.storage_areas
  where id = new.storage_area_id;

  if area_org is null then
    raise exception 'storage area not found for bin';
  end if;

  if area_org <> new.organization_id then
    raise exception 'bin storage area must belong to the same organization';
  end if;

  return new;
end;
$$;

create trigger storage_bins_same_org_area
before insert or update on public.storage_bins
for each row execute function private.enforce_storage_bin_same_org_area();

grant select, insert, update on public.storage_bins to authenticated;
grant all on public.storage_bins to service_role;
