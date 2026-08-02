-- Phase 3.6: operational alerts + optional count due dates

alter table public.count_sessions
  add column if not exists due_date date;

comment on column public.count_sessions.due_date is
  'Optional due date for overdue count alerts. Null means the session is never overdue.';

create table public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  alert_type text not null check (alert_type in (
    'low_stock',
    'out_of_stock',
    'expiring_soon',
    'expired_stock',
    'active_recall',
    'quarantined_inventory',
    'overdue_count',
    'overdue_purchase_order'
  )),
  severity text not null check (severity in (
    'informational', 'low', 'medium', 'high', 'critical'
  )),
  entity_type text not null,
  entity_id uuid not null,
  location_id uuid references public.locations (id) on delete set null,
  condition_key text not null,
  title text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  detected_at timestamptz not null default timezone('utc', now()),
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint operational_alerts_title_nonempty check (char_length(trim(title)) > 0),
  constraint operational_alerts_condition_nonempty check (char_length(trim(condition_key)) > 0),
  constraint operational_alerts_ack_fields check (
    (acknowledged_at is null and acknowledged_by is null)
    or (acknowledged_at is not null and acknowledged_by is not null)
  ),
  constraint operational_alerts_resolved_fields check (
    (status <> 'resolved' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null)
  )
);

create unique index operational_alerts_open_condition_uidx
  on public.operational_alerts (organization_id, condition_key)
  where status in ('open', 'acknowledged');

create index operational_alerts_org_status_idx
  on public.operational_alerts (organization_id, status, detected_at desc);

create index operational_alerts_org_type_idx
  on public.operational_alerts (organization_id, alert_type, status);

create index operational_alerts_org_location_idx
  on public.operational_alerts (organization_id, location_id)
  where location_id is not null;

comment on table public.operational_alerts is
  'Deterministic operational alerts derived from existing inventory domain conditions.';

drop trigger if exists operational_alerts_set_updated_at on public.operational_alerts;
create trigger operational_alerts_set_updated_at
before update on public.operational_alerts
for each row execute function public.set_updated_at();

-- Upsert helper for sync
create or replace function private.upsert_operational_alert(
  p_organization_id uuid,
  p_alert_type text,
  p_severity text,
  p_entity_type text,
  p_entity_id uuid,
  p_location_id uuid,
  p_condition_key text,
  p_title text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.operational_alerts
  set
    severity = p_severity,
    title = p_title,
    description = p_description,
    location_id = p_location_id,
    entity_type = p_entity_type,
    entity_id = p_entity_id,
    alert_type = p_alert_type
  where organization_id = p_organization_id
    and condition_key = p_condition_key
    and status in ('open', 'acknowledged');

  if found then
    return;
  end if;

  insert into public.operational_alerts (
    organization_id, alert_type, severity, entity_type, entity_id, location_id,
    condition_key, title, description, status, detected_at
  ) values (
    p_organization_id, p_alert_type, p_severity, p_entity_type, p_entity_id, p_location_id,
    p_condition_key, p_title, p_description, 'open', timezone('utc', now())
  );
end;
$$;

create or replace function public.sync_operational_alerts(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := p_organization_id;
  v_today date := (timezone('utc', now()))::date;
  v_expiring_end date := v_today + 30;
  v_keys text[] := array[]::text[];
  v_created int := 0;
  v_updated int := 0;
  v_resolved int := 0;
  v_before int;
  r record;
  v_available numeric;
  v_rule record;
  v_location_id uuid;
  v_item_name text;
  v_sku text;
  v_loc_name text;
  v_key text;
  v_state text;
  v_severity text;
begin
  if v_org_id is null then
    raise exception 'organization context required';
  end if;

  if not private.user_has_permission(v_org_id, 'alerts.manage') then
    raise exception 'permission denied';
  end if;

  -- Low / out of stock from reorder rules (mirrors Phase 3.5 usable qty rules)
  for v_rule in
    select *
    from public.reorder_rules rr
    where rr.organization_id = v_org_id
      and rr.status = 'active'
  loop
    for v_location_id in
      select distinct loc_id
      from (
        select b.location_id as loc_id
        from public.inventory_balances b
        where b.organization_id = v_org_id
          and b.item_id = v_rule.item_id
          and b.variant_id is not distinct from v_rule.variant_id
        union
        select v_rule.location_id
        where v_rule.location_id is not null
      ) locs
      where loc_id is not null
    loop
      -- Effective rule: location override wins
      if v_rule.location_id is not null and v_rule.location_id <> v_location_id then
        continue;
      end if;
      if v_rule.location_id is null and exists (
        select 1 from public.reorder_rules o
        where o.organization_id = v_org_id
          and o.item_id = v_rule.item_id
          and o.variant_id is not distinct from v_rule.variant_id
          and o.location_id = v_location_id
          and o.status = 'active'
      ) then
        continue; -- overridden
      end if;

      select coalesce(sum(b.quantity_on_hand), 0) into v_available
      from public.inventory_balances b
      left join public.inventory_lots l on l.id = b.lot_id
      where b.organization_id = v_org_id
        and b.item_id = v_rule.item_id
        and b.variant_id is not distinct from v_rule.variant_id
        and b.location_id = v_location_id
        and (
          b.lot_id is null
          or (
            l.status = 'active'
            and (l.expiration_date is null or l.expiration_date >= v_today)
          )
        );

      if v_available >= v_rule.minimum_quantity then
        continue;
      end if;

      v_state := case when v_available <= 0 then 'out_of_stock' else 'low_stock' end;
      v_severity := case when v_state = 'out_of_stock' then 'high' else 'medium' end;
      v_key := v_state || ':item:' || v_rule.item_id::text || ':' || v_location_id::text
        || case when v_rule.variant_id is null then '' else ':' || v_rule.variant_id::text end;

      select i.name, i.sku into v_item_name, v_sku
      from public.items i where i.id = v_rule.item_id;
      select l.name into v_loc_name from public.locations l where l.id = v_location_id;

      select count(*) into v_before
      from public.operational_alerts
      where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');

      perform private.upsert_operational_alert(
        v_org_id,
        v_state,
        v_severity,
        'item',
        v_rule.item_id,
        v_location_id,
        v_key,
        case when v_state = 'out_of_stock' then 'Out of stock' else 'Low stock' end
          || ': ' || coalesce(v_item_name, 'Item'),
        coalesce(v_item_name, 'Item')
          || coalesce(' (' || v_sku || ')', '')
          || ' at ' || coalesce(v_loc_name, 'location')
          || ' has available qty ' || trim(to_char(v_available, 'FM9999999990.######'))
          || ' (minimum ' || trim(to_char(v_rule.minimum_quantity, 'FM9999999990.######')) || ').'
      );

      v_keys := array_append(v_keys, v_key);
      if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    end loop;
  end loop;

  -- Expiring soon (active lots, expiration within 30 days, on-hand > 0)
  for r in
    select
      l.id as lot_id,
      l.lot_number,
      l.expiration_date,
      i.name as item_name,
      (
        select b.location_id
        from public.inventory_balances b
        where b.organization_id = v_org_id and b.lot_id = l.id and b.quantity_on_hand > 0
        order by b.quantity_on_hand desc
        limit 1
      ) as location_id,
      (
        select coalesce(sum(b.quantity_on_hand), 0)
        from public.inventory_balances b
        where b.organization_id = v_org_id and b.lot_id = l.id
      ) as qty
    from public.inventory_lots l
    join public.items i on i.id = l.item_id
    where l.organization_id = v_org_id
      and l.status = 'active'
      and l.expiration_date is not null
      and l.expiration_date >= v_today
      and l.expiration_date <= v_expiring_end
  loop
    if r.qty <= 0 then continue; end if;
    v_key := 'expiring_soon:lot:' || r.lot_id::text || ':' || coalesce(r.location_id::text, 'none');
    select count(*) into v_before
    from public.operational_alerts
    where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');
    perform private.upsert_operational_alert(
      v_org_id, 'expiring_soon', 'medium', 'lot', r.lot_id, r.location_id, v_key,
      'Expiring soon: ' || r.lot_number,
      coalesce(r.item_name, 'Item') || ' lot ' || r.lot_number
        || ' expires on ' || r.expiration_date::text || '.'
    );
    v_keys := array_append(v_keys, v_key);
    if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Expired stock (past date or status expired, on-hand > 0)
  for r in
    select
      l.id as lot_id,
      l.lot_number,
      l.expiration_date,
      l.status,
      i.name as item_name,
      (
        select b.location_id
        from public.inventory_balances b
        where b.organization_id = v_org_id and b.lot_id = l.id and b.quantity_on_hand > 0
        order by b.quantity_on_hand desc
        limit 1
      ) as location_id,
      (
        select coalesce(sum(b.quantity_on_hand), 0)
        from public.inventory_balances b
        where b.organization_id = v_org_id and b.lot_id = l.id
      ) as qty
    from public.inventory_lots l
    join public.items i on i.id = l.item_id
    where l.organization_id = v_org_id
      and (
        l.status = 'expired'
        or (l.expiration_date is not null and l.expiration_date < v_today)
      )
  loop
    if r.qty <= 0 and r.status <> 'expired' then continue; end if;
    if r.qty <= 0 then continue; end if;
    v_key := 'expired_stock:lot:' || r.lot_id::text || ':' || coalesce(r.location_id::text, 'none');
    select count(*) into v_before
    from public.operational_alerts
    where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');
    perform private.upsert_operational_alert(
      v_org_id, 'expired_stock', 'high', 'lot', r.lot_id, r.location_id, v_key,
      'Expired stock: ' || r.lot_number,
      coalesce(r.item_name, 'Item') || ' lot ' || r.lot_number
        || ' is expired'
        || case when r.expiration_date is null then '.' else ' (expiration ' || r.expiration_date::text || ').' end
    );
    v_keys := array_append(v_keys, v_key);
    if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Active recalls
  for r in
    select id, recall_number, title, severity
    from public.inventory_recalls
    where organization_id = v_org_id and status = 'active'
  loop
    v_key := 'active_recall:recall:' || r.id::text || ':none';
    v_severity := case r.severity
      when 'critical' then 'critical'
      when 'high' then 'high'
      when 'medium' then 'medium'
      when 'low' then 'low'
      else 'informational'
    end;
    select count(*) into v_before
    from public.operational_alerts
    where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');
    perform private.upsert_operational_alert(
      v_org_id, 'active_recall', v_severity, 'recall', r.id, null, v_key,
      'Active recall: ' || r.recall_number,
      r.title || ' (' || r.recall_number || ') is active.'
    );
    v_keys := array_append(v_keys, v_key);
    if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Quarantined lots
  for r in
    select
      l.id as lot_id,
      l.lot_number,
      i.name as item_name,
      (
        select b.location_id
        from public.inventory_balances b
        where b.organization_id = v_org_id and b.lot_id = l.id and b.quantity_on_hand > 0
        order by b.quantity_on_hand desc
        limit 1
      ) as location_id
    from public.inventory_lots l
    join public.items i on i.id = l.item_id
    where l.organization_id = v_org_id and l.status = 'quarantined'
  loop
    v_key := 'quarantined_inventory:lot:' || r.lot_id::text || ':' || coalesce(r.location_id::text, 'none');
    select count(*) into v_before
    from public.operational_alerts
    where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');
    perform private.upsert_operational_alert(
      v_org_id, 'quarantined_inventory', 'high', 'lot', r.lot_id, r.location_id, v_key,
      'Quarantined inventory: ' || r.lot_number,
      coalesce(r.item_name, 'Item') || ' lot ' || r.lot_number || ' is quarantined.'
    );
    v_keys := array_append(v_keys, v_key);
    if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Overdue counts
  for r in
    select
      cs.id,
      cs.name,
      cs.due_date,
      (
        select csl.location_id
        from public.count_session_locations csl
        where csl.count_session_id = cs.id
        order by csl.created_at
        limit 1
      ) as location_id
    from public.count_sessions cs
    where cs.organization_id = v_org_id
      and cs.due_date is not null
      and cs.due_date < v_today
      and cs.status not in ('completed', 'cancelled')
  loop
    v_key := 'overdue_count:count_session:' || r.id::text || ':' || coalesce(r.location_id::text, 'none');
    select count(*) into v_before
    from public.operational_alerts
    where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');
    perform private.upsert_operational_alert(
      v_org_id, 'overdue_count', 'medium', 'count_session', r.id, r.location_id, v_key,
      'Overdue count: ' || r.name,
      'Count "' || r.name || '" was due on ' || r.due_date::text || '.'
    );
    v_keys := array_append(v_keys, v_key);
    if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Overdue purchase orders
  for r in
    select id, po_number, expected_date, ship_to_location_id
    from public.purchase_orders
    where organization_id = v_org_id
      and expected_date is not null
      and expected_date < v_today
      and status in ('submitted', 'partially_received')
  loop
    v_key := 'overdue_purchase_order:purchase_order:' || r.id::text || ':' || r.ship_to_location_id::text;
    select count(*) into v_before
    from public.operational_alerts
    where organization_id = v_org_id and condition_key = v_key and status in ('open', 'acknowledged');
    perform private.upsert_operational_alert(
      v_org_id, 'overdue_purchase_order', 'medium', 'purchase_order', r.id, r.ship_to_location_id, v_key,
      'Overdue purchase order: ' || r.po_number,
      'Purchase order ' || r.po_number || ' was expected on ' || r.expected_date::text || '.'
    );
    v_keys := array_append(v_keys, v_key);
    if v_before = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
  end loop;

  -- Auto-resolve stale open/acknowledged alerts
  with resolved as (
    update public.operational_alerts a
    set status = 'resolved', resolved_at = timezone('utc', now())
    where a.organization_id = v_org_id
      and a.status in ('open', 'acknowledged')
      and (
        cardinality(v_keys) = 0
        or not (a.condition_key = any (v_keys))
      )
    returning a.id
  )
  select count(*) into v_resolved from resolved;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'resolved', v_resolved,
    'activeConditions', coalesce(cardinality(v_keys), 0)
  );
end;
$$;

revoke all on function public.sync_operational_alerts(uuid) from public;
grant execute on function public.sync_operational_alerts(uuid) to authenticated;
grant execute on function public.sync_operational_alerts(uuid) to service_role;

-- RLS
alter table public.operational_alerts enable row level security;

grant select, update on public.operational_alerts to authenticated;
grant all on public.operational_alerts to service_role;
-- Inserts happen via SECURITY DEFINER sync only
revoke insert, delete on public.operational_alerts from authenticated;

create policy operational_alerts_select on public.operational_alerts for select to authenticated
using (
  private.user_has_permission(organization_id, 'alerts.read')
  and (
    location_id is null
    or private.user_can_access_location(location_id)
  )
);

create policy operational_alerts_update on public.operational_alerts for update to authenticated
using (
  private.user_has_permission(organization_id, 'alerts.manage')
  and (
    location_id is null
    or private.user_can_access_location(location_id)
  )
)
with check (
  private.user_has_permission(organization_id, 'alerts.manage')
  and (
    location_id is null
    or private.user_can_access_location(location_id)
  )
);
