-- V1 RC: align location checks on SECURITY DEFINER RPCs + FORCE RLS on Phase 3+ tables

-- Cancel PO: require ship-to location access (matches submit/receive)
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
  if not private.user_can_access_location(v_po.ship_to_location_id) then
    raise exception 'ship-to location is not accessible';
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

-- Submit count for review: require access to all assigned locations
create or replace function public.submit_count_session_for_review(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_pending integer;
  v_location_id uuid;
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
    raise exception 'only in-progress counts can be submitted for review';
  end if;

  for v_location_id in
    select location_id from public.count_session_locations where count_session_id = v_session.id
  loop
    if not private.user_can_access_location(v_location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

  select count(*) into v_pending
  from public.count_lines
  where count_session_id = v_session.id
    and status = 'pending';

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

-- Return count for correction: require access to all assigned locations
create or replace function public.return_count_session_for_correction(p_session_id uuid)
returns public.count_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.count_sessions%rowtype;
  v_location_id uuid;
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

  for v_location_id in
    select location_id from public.count_session_locations where count_session_id = v_session.id
  loop
    if not private.user_can_access_location(v_location_id) then
      raise exception 'location is not accessible';
    end if;
  end loop;

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

-- FORCE RLS on Phase 3+ tables (defense in depth; matches earlier domains)
alter table public.count_sessions force row level security;
alter table public.count_session_locations force row level security;
alter table public.count_lines force row level security;
alter table public.suppliers force row level security;
alter table public.supplier_contacts force row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_lines force row level security;
alter table public.purchase_order_counters force row level security;
alter table public.inventory_lots force row level security;
alter table public.inventory_recalls force row level security;
alter table public.inventory_recall_lots force row level security;
alter table public.reorder_rules force row level security;
alter table public.restock_plan_requests force row level security;
alter table public.restock_plan_request_orders force row level security;
alter table public.operational_alerts force row level security;
