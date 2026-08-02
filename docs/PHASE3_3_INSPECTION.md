# Phase 3.3 inspection

**Date:** 2026-08-02

## 1. Phase 3.2 matches documentation

Yes. Suppliers, POs, and `receive_purchase_order` → `complete_inventory_transaction` are live. Balance/ledger dimensions are org/item/variant/location/area/bin with `UNIQUE NULLS NOT DISTINCT`. No lot columns or item tracking mode exist.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `private.apply_inventory_balance_delta` | Add nullable `p_lot_id`; extend unique key |
| `private.post_ledger_and_balance` | Pass lot into ledger insert + balance delta |
| `private.lock_and_assert_sufficient_stock` | Lock exact lot dimension |
| `complete_inventory_transaction` / `reverse_inventory_transaction` | Pass line `lot_id` — no forked completion |
| Count start / approve | Freeze and post with lot dims; still call complete |
| `receive_purchase_order` | Accept/create lot; set line `lot_id`; still call complete |
| Permission seed/backfill | `inventory.lots.read` / `inventory.lots.manage` |

## 3. Architectural concerns

| Concern | Resolution |
| --- | --- |
| Must not duplicate completion | Thread `lot_id` through private posting helpers only |
| Backward compatibility | Nullable `lot_id`; quantity-mode items keep null lots |
| Unique balance key change | Drop/recreate `inventory_balances_dims_uidx` including `lot_id`; rebuild after migrate |
| Ledger immutability | New rows only; no UPDATE of historical ledger |
| Tracking mode flip after activity | Block change when any ledger entry exists for the item |
| Transfer same lot | Single `lot_id` on line applies to both sides |
| Reverse preserves lot | Copy line `lot_id`; post from ledger `lot_id` |
| Quarantine | Block movements that reference non-`active` lots (except status management) |
| Expiration blocking | Informational views only; do not auto-block by date |
| Count dimensions | Extend `count_lines` unique + freeze select with `lot_id` |
| FORCE RLS | Unchanged; writes remain SECURITY DEFINER |

## 4. Decisions

| Topic | Decision |
| --- | --- |
| Item field | `tracking_mode` ∈ (`quantity`, `lot`), default `quantity` |
| Line lot | Single nullable `inventory_transaction_lines.lot_id` |
| Ledger/balance | Nullable `lot_id` in unique/group dimensions |
| Lot statuses | `active`, `quarantined`, `depleted`, `expired` |
| Lot uniqueness | `(organization_id, item_id, variant_id, lot_number)` NULLS NOT DISTINCT |
| Soft delete | No hard delete when ledger history exists |
| Permissions | `inventory.lots.read` / `inventory.lots.manage` |
| Expiration UI | Filters: expired, ≤30/60/90 days |
| ADR | No supersede; lots are additional balance dimensions |

## 5. Migration sequence

1. `phase3_3_lot_permissions` — keys + role seed/backfill  
2. `phase3_3_lots` — items.tracking_mode, inventory_lots, line/ledger/balance lot_id, helper updates, count/PO/RPC updates, RLS  

## 6. Expected file changes

- Migrations + permission catalog + `appConfig.phase = 3.3`
- Inventory/count/procurement schemas, commands, UI for lot entry/selection
- Stock expiration view route
- Item detail lot management
- `supabase/tests/rls.lots.test.ts`
- Docs: PRODUCT_CONTEXT, INVENTORY_LEDGER, DATA_DICTIONARY, ROADMAP, ARCHITECTURE

## 7. Assumptions

1. Variant-scoped lot numbers: same lot number may exist on different variants.
2. Depleted status is set manually or when remaining balance reaches zero on receive/consume paths optionally — Phase 3.3 sets `depleted` when apply delta leaves qty ≤ 0 for that lot, and reactivates to `active` if stock returns (only if status was depleted).
3. Creating a lot during receipt is allowed for users with `inventory.lots.manage` or receive path may create via SECURITY DEFINER when receiving.
4. Serials, recalls, FEFO, temperature, controlled substances remain out of scope.

## Completion notes

Phase 3.3 adds optional lot dimensions through the existing ledger engine. Serials, recalls, automated FEFO, Nolt, Stripe, and PandaDoc remain out of scope.
