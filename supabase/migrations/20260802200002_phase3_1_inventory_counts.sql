-- Phase 3.1: inventory count sessions, lines, RLS, and reconciliation RPCs

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.count_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'ready_for_review', 'completed', 'cancelled')),
  blind_count_enabled boolean not null default false,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint count_sessions_name_nonempty check (char_length(trim(name)) > 0),
  constraint count_sessions_started_fields check (
    (status in ('in_progress', 'ready_for_review', 'completed') and started_at is not null and started_by is not null)
    or (status in ('draft', 'cancelled'))
  ),
  constraint count_sessions_completed_fields check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status <> 'completed')
  )
);

create index count_sessions_org_status_idx
  on public.count_sessions (organization_id, status, created_at desc);

create table public.count_session_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  count_session_id uuid not null references public.count_sessions (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (count_session_id, location_id)
);

create index count_session_locations_location_idx
  on public.count_session_locations (organization_id, location_id);

create table public.count_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  count_session_id uuid not null references public.count_sessions (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  variant_id uuid references public.item_variants (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  storage_area_id uuid not null references public.storage_areas (id) on delete restrict,
  bin_id uuid references public.storage_bins (id) on delete restrict,
  expected_quantity numeric(20, 6) not null default 0,
  counted_quantity numeric(20, 6),
  variance numeric(20, 6),
  status text not null default 'pending'
    check (status in ('pending', 'counted', 'accepted', 'rejected')),
  notes text,
  counted_by uuid references public.profiles (id) on delete set null,
  counted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  reconciliation_transaction_id uuid references public.inventory_transactions (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint count_lines_expected_nonnegative check (expected_quantity >= 0),
  constraint count_lines_counted_nonnegative check (
    counted_quantity is null or counted_quantity >= 0
  )
);

create unique index count_lines_dimension_uidx
  on public.count_lines (
    count_session_id,
    item_id,
    variant_id,
    location_id,
    storage_area_id,
    bin_id
  ) nulls not distinct;

create index count_lines_session_idx
  on public.count_lines (count_session_id, status);

comment on table public.count_sessions is
  'Physical inventory count sessions. Variances reconcile via inventory adjustments.';
comment on column public.count_lines.expected_quantity is
  'Frozen on-hand snapshot in base units at count start; never updated by later movements.';
comment on column public.count_lines.variance is
  'counted_quantity - expected_quantity once counted.';

-- ---------------------------------------------------------------------------
-- Integrity / immutability triggers
-- ---------------------------------------------------------------------------

drop trigger if exists count_sessions_set_updated_at on public.count_sessions;
create trigger count_sessions_set_updated_at
before update on public.count_sessions
for each row execute function public.set_updated_at();

drop trigger if exists count_lines_set_updated_at on public.count_lines;
create trigger count_lines_set_updated_at
before update on public.count_lines
for each row execute function public.set_updated_at();

create or replace function private.enforce_count_session_location_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_org uuid;
  v_location_org uuid;
begin
  select organization_id into v_session_org
  from public.count_sessions where id = new.count_session_id;

  if v_session_org is null or v_session_org <> new.organization_id then
    raise exception 'count session location must belong to the same organization as its session';
  end if;

  select organization_id into v_location_org
  from public.locations where id = new.location_id;

  if v_location_org is null or v_location_org <> new.organization_id then
    raise exception 'count location must belong to the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists count_session_locations_integrity on public.count_session_locations;
create trigger count_session_locations_integrity
before insert or update on public.count_session_locations
for each row execute function private.enforce_count_session_location_integrity();

create or replace function private.enforce_count_line_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_org uuid;
  v_item_org uuid;
  v_requires boolean;
  v_variant_item uuid;
  v_variant_org uuid;
  v_loc_org uuid;
  v_area_org uuid;
  v_area_loc uuid;
  v_bin_org uuid;
  v_bin_area uuid;
begin
  select organization_id into v_session_org
  from public.count_sessions where id = new.count_session_id;

  if v_session_org is null or v_session_org <> new.organization_id then
    raise exception 'count line must belong to the same organization as its session';
  end if;

  select organization_id, requires_variant into v_item_org, v_requires
  from public.items where id = new.item_id;
  if v_item_org is null or v_item_org <> new.organization_id then
    raise exception 'count line item must belong to the same organization';
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

  select organization_id into v_loc_org from public.locations where id = new.location_id;
  if v_loc_org is null or v_loc_org <> new.organization_id then
    raise exception 'count line location must belong to the same organization';
  end if;

  select organization_id, location_id into v_area_org, v_area_loc
  from public.storage_areas where id = new.storage_area_id;
  if v_area_org is null or v_area_org <> new.organization_id then
    raise exception 'count line storage area must belong to the same organization';
  end if;
  if v_area_loc <> new.location_id then
    raise exception 'count line storage area must belong to the location';
  end if;

  if new.bin_id is not null then
    select organization_id, storage_area_id into v_bin_org, v_bin_area
    from public.storage_bins where id = new.bin_id;
    if v_bin_org is null or v_bin_org <> new.organization_id then
      raise exception 'count line bin must belong to the same organization';
    end if;
    if v_bin_area <> new.storage_area_id then
      raise exception 'count line bin must belong to the storage area';
    end if;
  end if;

  if new.counted_quantity is not null then
    new.variance := new.counted_quantity - new.expected_quantity;
  else
    new.variance := null;
  end if;

  return new;
end;
$$;

drop trigger if exists count_lines_integrity on public.count_lines;
create trigger count_lines_integrity
before insert or update on public.count_lines
for each row execute function private.enforce_count_line_integrity();

create or replace function private.enforce_count_session_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('completed', 'in_progress', 'ready_for_review') then
      raise exception 'active or completed count sessions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'completed' then
    raise exception 'completed count sessions cannot be edited';
  end if;

  if old.status = 'cancelled' and new.status is distinct from old.status then
    raise exception 'cancelled count sessions cannot change status';
  end if;

  if old.started_at is not null and new.started_at is distinct from old.started_at then
    raise exception 'count session started_at is immutable';
  end if;

  if old.blind_count_enabled is distinct from new.blind_count_enabled
    and old.status <> 'draft' then
    raise exception 'blind count setting can only change while draft';
  end if;

  return new;
end;
$$;

drop trigger if exists count_sessions_immutability on public.count_sessions;
create trigger count_sessions_immutability
before update or delete on public.count_sessions
for each row execute function private.enforce_count_session_immutability();

create or replace function private.enforce_count_line_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.count_sessions
  where id = coalesce(new.count_session_id, old.count_session_id);

  if tg_op = 'DELETE' then
    if v_status in ('ready_for_review', 'completed', 'cancelled') then
      raise exception 'count lines cannot be deleted in the current session status';
    end if;
    return old;
  end if;

  if v_status = 'completed' or v_status = 'cancelled' then
    raise exception 'count lines cannot be edited when the session is completed or cancelled';
  end if;

  if v_status = 'draft' then
    raise exception 'count lines cannot be modified while the session is draft';
  end if;

  if tg_op = 'INSERT' and v_status <> 'in_progress' then
    raise exception 'count lines can only be added while the session is in progress';
  end if;

  if tg_op = 'UPDATE' and old.expected_quantity is distinct from new.expected_quantity then
    raise exception 'expected quantity is frozen and cannot be changed';
  end if;

  if tg_op = 'UPDATE' and v_status = 'ready_for_review' then
    -- Only review fields may change (status accept/reject, review metadata, reconciliation link).
    if old.counted_quantity is distinct from new.counted_quantity
      or old.item_id is distinct from new.item_id
      or old.variant_id is distinct from new.variant_id
      or old.location_id is distinct from new.location_id
      or old.storage_area_id is distinct from new.storage_area_id
      or old.bin_id is distinct from new.bin_id
      or old.expected_quantity is distinct from new.expected_quantity then
      raise exception 'count quantities cannot be edited during review';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists count_lines_lifecycle on public.count_lines;
create trigger count_lines_lifecycle
before insert or update or delete on public.count_lines
for each row execute function private.enforce_count_line_lifecycle();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.count_sessions enable row level security;
alter table public.count_session_locations enable row level security;
alter table public.count_lines enable row level security;

grant select, insert, update, delete on public.count_sessions to authenticated;
grant select, insert, delete on public.count_session_locations to authenticated;
grant select, insert, update, delete on public.count_lines to authenticated;
grant all on public.count_sessions to service_role;
grant all on public.count_session_locations to service_role;
grant all on public.count_lines to service_role;

-- Location-scoped session visibility. Do NOT re-select count_sessions inside a
-- helper used by this policy: INSERT…RETURNING evaluates SELECT policies against
-- the new row, and a nested lookup of the same table fails RLS (42501).
create policy count_sessions_select on public.count_sessions for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.count.read')
  and (
    not exists (
      select 1 from public.count_session_locations csl
      where csl.count_session_id = id
    )
    or exists (
      select 1 from public.count_session_locations csl
      where csl.count_session_id = id
        and private.user_can_access_location(csl.location_id)
    )
  )
);

create policy count_sessions_insert on public.count_sessions for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  and status = 'draft'
);

create policy count_sessions_update on public.count_sessions for update to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  or private.user_has_permission(organization_id, 'inventory.count.review')
)
with check (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  or private.user_has_permission(organization_id, 'inventory.count.review')
);

create policy count_sessions_delete on public.count_sessions for delete to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  and status = 'draft'
);

create policy count_session_locations_select on public.count_session_locations for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.count.read')
  and private.user_can_access_location(location_id)
);

create policy count_session_locations_insert on public.count_session_locations for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  and private.user_can_access_location(location_id)
);

create policy count_session_locations_delete on public.count_session_locations for delete to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  and private.user_can_access_location(location_id)
  and exists (
    select 1 from public.count_sessions s
    where s.id = count_session_id and s.status = 'draft'
  )
);

create policy count_lines_select on public.count_lines for select to authenticated
using (
  private.user_has_permission(organization_id, 'inventory.count.read')
  and private.user_can_access_location(location_id)
);

create policy count_lines_insert on public.count_lines for insert to authenticated
with check (
  private.user_has_permission(organization_id, 'inventory.count.perform')
  and private.user_can_access_location(location_id)
);

create policy count_lines_update on public.count_lines for update to authenticated
using (
  (
    private.user_has_permission(organization_id, 'inventory.count.perform')
    or private.user_has_permission(organization_id, 'inventory.count.review')
  )
  and private.user_can_access_location(location_id)
)
with check (
  (
    private.user_has_permission(organization_id, 'inventory.count.perform')
    or private.user_has_permission(organization_id, 'inventory.count.review')
  )
  and private.user_can_access_location(location_id)
);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.start_count_session(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_location_id uuid;
  v_loc_count integer;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'count session not found';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.perform') then
    raise exception 'permission denied to start inventory count';
  end if;

  if v_session.status <> 'draft' then
    raise exception 'only draft count sessions can be started';
  end if;

  select count(*) into v_loc_count
  from public.count_session_locations
  where count_session_id = v_session.id;

  if v_loc_count = 0 then
    raise exception 'assign at least one location before starting the count';
  end if;

  for v_location_id in
    select location_id from public.count_session_locations where count_session_id = v_session.id
  loop
    if not private.user_can_access_location(v_location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  -- Flip to in_progress before inserting lines (lifecycle blocks draft line writes).
  update public.count_sessions
  set status = 'in_progress',
      started_by = auth.uid(),
      started_at = timezone('utc', now())
  where id = v_session.id
  returning * into v_session;

  insert into public.count_lines (
    organization_id,
    count_session_id,
    item_id,
    variant_id,
    location_id,
    storage_area_id,
    bin_id,
    expected_quantity,
    status
  )
  select
    b.organization_id,
    v_session.id,
    b.item_id,
    b.variant_id,
    b.location_id,
    b.storage_area_id,
    b.bin_id,
    b.quantity_on_hand,
    'pending'
  from public.inventory_balances b
  join public.count_session_locations csl
    on csl.count_session_id = v_session.id
   and csl.location_id = b.location_id
  where b.organization_id = v_session.organization_id
    and b.quantity_on_hand <> 0;

  return v_session;
end;
$$;

create or replace function public.submit_count_session_for_review(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_pending integer;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'count session not found';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.perform') then
    raise exception 'permission denied to submit inventory count';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'only in-progress count sessions can be submitted for review';
  end if;

  select count(*) into v_pending
  from public.count_lines
  where count_session_id = v_session.id
    and (counted_quantity is null or status = 'pending');

  if v_pending > 0 then
    raise exception 'all count lines must be counted before review';
  end if;

  if not exists (select 1 from public.count_lines where count_session_id = v_session.id) then
    raise exception 'count session has no lines';
  end if;

  update public.count_sessions
  set status = 'ready_for_review'
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.return_count_session_for_correction(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'count session not found';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.review') then
    raise exception 'permission denied to return inventory count';
  end if;

  if v_session.status <> 'ready_for_review' then
    raise exception 'only counts ready for review can be returned';
  end if;

  update public.count_lines
  set status = 'counted',
      reviewed_by = null,
      reviewed_at = null
  where count_session_id = v_session.id
    and status in ('accepted', 'rejected');

  update public.count_sessions
  set status = 'in_progress'
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.review_count_line(
  p_line_id uuid,
  p_decision text
)
returns public.count_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.count_lines%rowtype;
  v_session public.count_sessions%rowtype;
begin
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'review decision must be accepted or rejected';
  end if;

  select * into v_line
  from public.count_lines
  where id = p_line_id
  for update;

  if not found then
    raise exception 'count line not found';
  end if;

  select * into v_session
  from public.count_sessions
  where id = v_line.count_session_id
  for update;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.review') then
    raise exception 'permission denied to review inventory count';
  end if;

  if not private.user_can_access_location(v_line.location_id) then
    raise exception 'location is not accessible';
  end if;

  if v_session.status <> 'ready_for_review' then
    raise exception 'count line can only be reviewed when the session is ready for review';
  end if;

  if v_line.counted_quantity is null then
    raise exception 'count line has not been counted';
  end if;

  update public.count_lines
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc', now())
  where id = v_line.id
  returning * into v_line;

  return v_line;
end;
$$;

create or replace function public.approve_count_session_reconciliation(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_unreviewed integer;
  v_positive_txn uuid;
  v_negative_txn uuid;
  v_line public.count_lines%rowtype;
  v_base_unit_id uuid;
  v_line_no integer;
  v_notes text;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'count session not found';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.count.review') then
    raise exception 'permission denied to approve inventory count';
  end if;

  if not private.user_has_permission(v_session.organization_id, 'inventory.adjust') then
    raise exception 'permission denied to create inventory adjustments for count reconciliation';
  end if;

  if v_session.status <> 'ready_for_review' then
    raise exception 'only counts ready for review can be approved';
  end if;

  if v_session.status = 'completed' then
    raise exception 'count session already completed';
  end if;

  select count(*) into v_unreviewed
  from public.count_lines
  where count_session_id = v_session.id
    and status not in ('accepted', 'rejected');

  if v_unreviewed > 0 then
    raise exception 'all count lines must be accepted or rejected before approval';
  end if;

  for v_line in
    select * from public.count_lines
    where count_session_id = v_session.id
  loop
    if not private.user_can_access_location(v_line.location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  v_notes := 'Count reconciliation: ' || v_session.name;

  -- Positive variances → one positive adjustment
  if exists (
    select 1 from public.count_lines
    where count_session_id = v_session.id
      and status = 'accepted'
      and coalesce(variance, 0) > 0
  ) then
    insert into public.inventory_transactions (
      organization_id,
      transaction_type,
      status,
      notes,
      transaction_number,
      created_by
    ) values (
      v_session.organization_id,
      'positive_adjustment',
      'draft',
      v_notes,
      '',
      auth.uid()
    )
    returning id into v_positive_txn;

    v_line_no := 0;
    for v_line in
      select * from public.count_lines
      where count_session_id = v_session.id
        and status = 'accepted'
        and coalesce(variance, 0) > 0
      order by location_id, item_id
    loop
      v_line_no := v_line_no + 1;
      select base_unit_id into v_base_unit_id from public.items where id = v_line.item_id;

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
        notes
      ) values (
        v_session.organization_id,
        v_positive_txn,
        v_line_no,
        v_line.item_id,
        v_line.variant_id,
        v_line.variance,
        v_base_unit_id,
        1,
        v_line.variance,
        v_line.location_id,
        v_line.storage_area_id,
        v_line.bin_id,
        'Count line ' || v_line.id::text
      );

      update public.count_lines
      set reconciliation_transaction_id = v_positive_txn
      where id = v_line.id;
    end loop;

    perform public.complete_inventory_transaction(v_positive_txn);
  end if;

  -- Negative variances → one negative adjustment
  if exists (
    select 1 from public.count_lines
    where count_session_id = v_session.id
      and status = 'accepted'
      and coalesce(variance, 0) < 0
  ) then
    insert into public.inventory_transactions (
      organization_id,
      transaction_type,
      status,
      notes,
      transaction_number,
      created_by
    ) values (
      v_session.organization_id,
      'negative_adjustment',
      'draft',
      v_notes,
      '',
      auth.uid()
    )
    returning id into v_negative_txn;

    v_line_no := 0;
    for v_line in
      select * from public.count_lines
      where count_session_id = v_session.id
        and status = 'accepted'
        and coalesce(variance, 0) < 0
      order by location_id, item_id
    loop
      v_line_no := v_line_no + 1;
      select base_unit_id into v_base_unit_id from public.items where id = v_line.item_id;

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
        source_location_id,
        source_storage_area_id,
        source_bin_id,
        notes
      ) values (
        v_session.organization_id,
        v_negative_txn,
        v_line_no,
        v_line.item_id,
        v_line.variant_id,
        abs(v_line.variance),
        v_base_unit_id,
        1,
        abs(v_line.variance),
        v_line.location_id,
        v_line.storage_area_id,
        v_line.bin_id,
        'Count line ' || v_line.id::text
      );

      update public.count_lines
      set reconciliation_transaction_id = v_negative_txn
      where id = v_line.id;
    end loop;

    perform public.complete_inventory_transaction(v_negative_txn);
  end if;

  update public.count_sessions
  set status = 'completed',
      completed_by = auth.uid(),
      completed_at = timezone('utc', now())
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.start_count_session(uuid) from public;
grant execute on function public.start_count_session(uuid) to authenticated;
grant execute on function public.start_count_session(uuid) to service_role;

revoke all on function public.submit_count_session_for_review(uuid) from public;
grant execute on function public.submit_count_session_for_review(uuid) to authenticated;
grant execute on function public.submit_count_session_for_review(uuid) to service_role;

revoke all on function public.return_count_session_for_correction(uuid) from public;
grant execute on function public.return_count_session_for_correction(uuid) to authenticated;
grant execute on function public.return_count_session_for_correction(uuid) to service_role;

revoke all on function public.review_count_line(uuid, text) from public;
grant execute on function public.review_count_line(uuid, text) to authenticated;
grant execute on function public.review_count_line(uuid, text) to service_role;

revoke all on function public.approve_count_session_reconciliation(uuid) from public;
grant execute on function public.approve_count_session_reconciliation(uuid) to authenticated;
grant execute on function public.approve_count_session_reconciliation(uuid) to service_role;
