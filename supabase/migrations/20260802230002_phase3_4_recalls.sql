-- Phase 3.4: inventory recalls over existing lot quarantine

create table public.inventory_recalls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title text not null,
  recall_number text not null,
  external_reference text,
  source text not null default 'internal',
  severity text not null default 'medium'
    check (severity in ('informational', 'low', 'medium', 'high', 'critical')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'resolved', 'cancelled')),
  announced_date date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_recalls_title_nonempty check (char_length(trim(title)) > 0),
  constraint inventory_recalls_number_nonempty check (char_length(trim(recall_number)) > 0),
  constraint inventory_recalls_source_nonempty check (char_length(trim(source)) > 0)
);

create unique index inventory_recalls_org_number_uidx
  on public.inventory_recalls (organization_id, lower(trim(recall_number)));

create index inventory_recalls_org_status_idx
  on public.inventory_recalls (organization_id, status, created_at desc);

comment on table public.inventory_recalls is
  'Operational recall records. Quarantine reuses inventory_lots.status; resolve does not auto-release lots.';

drop trigger if exists inventory_recalls_set_updated_at on public.inventory_recalls;
create trigger inventory_recalls_set_updated_at
before update on public.inventory_recalls
for each row execute function public.set_updated_at();

create table public.inventory_recall_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  recall_id uuid not null references public.inventory_recalls (id) on delete cascade,
  lot_id uuid not null references public.inventory_lots (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (recall_id, lot_id)
);

create index inventory_recall_lots_lot_idx
  on public.inventory_recall_lots (lot_id);

create index inventory_recall_lots_org_idx
  on public.inventory_recall_lots (organization_id, recall_id);

comment on table public.inventory_recall_lots is
  'Lots affected by a recall. Duplicate attachments are blocked.';

create or replace function private.enforce_inventory_recall_lot_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recall_org uuid;
  v_recall_status text;
  v_lot_org uuid;
begin
  select organization_id, status into v_recall_org, v_recall_status
  from public.inventory_recalls where id = new.recall_id;

  if v_recall_org is null then
    raise exception 'recall not found';
  end if;
  if v_recall_org <> new.organization_id then
    raise exception 'recall lot must belong to the same organization';
  end if;
  if v_recall_status in ('resolved', 'cancelled') then
    raise exception 'cannot attach lots to a closed recall';
  end if;

  select organization_id into v_lot_org from public.inventory_lots where id = new.lot_id;
  if v_lot_org is null then
    raise exception 'lot not found';
  end if;
  if v_lot_org <> new.organization_id then
    raise exception 'recall and lots must belong to the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_recall_lots_integrity on public.inventory_recall_lots;
create trigger inventory_recall_lots_integrity
before insert or update on public.inventory_recall_lots
for each row execute function private.enforce_inventory_recall_lot_integrity();

create or replace function private.enforce_inventory_recall_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status in ('resolved', 'cancelled') and new.status is distinct from old.status then
      raise exception 'closed recalls cannot change status';
    end if;
    if old.status = 'draft' and new.status not in ('draft', 'active', 'cancelled') then
      raise exception 'draft recalls can only become active or cancelled';
    end if;
    if old.status = 'active' and new.status not in ('active', 'resolved', 'cancelled') then
      raise exception 'active recalls can only become resolved or cancelled';
    end if;
    if new.status in ('resolved', 'cancelled') and old.status not in ('resolved', 'cancelled') then
      if new.closed_at is null then
        new.closed_at := timezone('utc', now());
      end if;
    end if;
    if new.status in ('draft', 'active') then
      new.closed_at := null;
      new.closed_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_recalls_lifecycle on public.inventory_recalls;
create trigger inventory_recalls_lifecycle
before update on public.inventory_recalls
for each row execute function private.enforce_inventory_recall_lifecycle();

-- Quarantine all lots on a recall (reuses inventory_lots.status)
create or replace function public.quarantine_recall_lots(p_recall_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recall public.inventory_recalls%rowtype;
  v_count integer := 0;
begin
  select * into v_recall
  from public.inventory_recalls
  where id = p_recall_id
  for update;

  if v_recall.id is null then
    raise exception 'recall not found';
  end if;

  if not private.user_has_permission(v_recall.organization_id, 'inventory.recalls.manage') then
    raise exception 'permission denied';
  end if;

  if v_recall.status not in ('draft', 'active') then
    raise exception 'only draft or active recalls can quarantine lots';
  end if;

  update public.inventory_lots l
  set status = 'quarantined'
  where l.id in (
      select rl.lot_id
      from public.inventory_recall_lots rl
      where rl.recall_id = v_recall.id
    )
    and l.organization_id = v_recall.organization_id
    and l.status is distinct from 'quarantined';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.quarantine_recall_lots(uuid) to authenticated;
grant execute on function public.quarantine_recall_lots(uuid) to service_role;

-- RLS
alter table public.inventory_recalls enable row level security;
alter table public.inventory_recall_lots enable row level security;

grant select, insert, update on public.inventory_recalls to authenticated;
grant select, insert, delete on public.inventory_recall_lots to authenticated;
grant all on public.inventory_recalls to service_role;
grant all on public.inventory_recall_lots to service_role;

create policy inventory_recalls_select on public.inventory_recalls for select to authenticated
using (private.user_has_permission(organization_id, 'inventory.recalls.read'));

create policy inventory_recalls_insert on public.inventory_recalls for insert to authenticated
with check (private.user_has_permission(organization_id, 'inventory.recalls.manage'));

create policy inventory_recalls_update on public.inventory_recalls for update to authenticated
using (private.user_has_permission(organization_id, 'inventory.recalls.manage'))
with check (private.user_has_permission(organization_id, 'inventory.recalls.manage'));

create policy inventory_recall_lots_select on public.inventory_recall_lots for select to authenticated
using (private.user_has_permission(organization_id, 'inventory.recalls.read'));

create policy inventory_recall_lots_insert on public.inventory_recall_lots for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.recalls.manage')
  and exists (
    select 1 from public.inventory_recalls r
    where r.id = recall_id
      and r.organization_id = organization_id
      and r.status in ('draft', 'active')
  )
);

create policy inventory_recall_lots_delete on public.inventory_recall_lots for delete to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.recalls.manage')
  and exists (
    select 1 from public.inventory_recalls r
    where r.id = recall_id
      and r.organization_id = organization_id
      and r.status in ('draft', 'active')
  )
);
