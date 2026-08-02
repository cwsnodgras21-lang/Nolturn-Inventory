-- Phase 2.1: units of measure (tenant-owned)

create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  symbol text not null check (char_length(trim(symbol)) > 0),
  dimension text not null check (dimension in ('count', 'volume', 'mass', 'length')),
  precision smallint not null default 0 check (precision >= 0 and precision <= 6),
  unit_kind text not null check (unit_kind in ('measurement', 'packaging')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_system boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name_normalized text generated always as (lower(trim(name))) stored,
  symbol_normalized text generated always as (lower(trim(symbol))) stored
);

create unique index units_of_measure_org_name_normalized_uidx
  on public.units_of_measure (organization_id, name_normalized);

create unique index units_of_measure_org_symbol_normalized_uidx
  on public.units_of_measure (organization_id, symbol_normalized);

create index units_of_measure_organization_id_idx
  on public.units_of_measure (organization_id);

create index units_of_measure_org_status_idx
  on public.units_of_measure (organization_id, status);

create trigger units_of_measure_set_updated_at
before update on public.units_of_measure
for each row execute function public.set_updated_at();

create or replace function private.prevent_unit_org_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'units_of_measure.organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger units_of_measure_prevent_org_move
before update on public.units_of_measure
for each row execute function private.prevent_unit_org_move();

comment on table public.units_of_measure is
  'Tenant-owned units. Packaging units have no universal conversion; item-specific conversions arrive in Phase 2.2.';

comment on column public.units_of_measure.unit_kind is
  'measurement = SI-like units; packaging = commercial units without global conversion.';

grant select, insert, update on public.units_of_measure to authenticated;
grant all on public.units_of_measure to service_role;
