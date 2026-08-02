# Nolt Inventory

Multi-tenant inventory operations platform by NolTurn Solutions.

**Phase 2.4** — immutable inventory ledger with opening balances and positive adjustments.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run supabase:start
# Copy API URL + keys from:
npx supabase status -o env
# into .env.local (this project uses API port 56421 by default)

npm run db:reset
npm run db:bootstrap
npm run dev
```

Demo password for seeded users: `password123`  
Bootstrap also seeds demo catalog, storage hierarchies, and an opening balance per primary location.

## Verification

```bash
npm run verify
npm run test:rls
npm run test:e2e
```

## Documentation

See `docs/PRODUCT_CONTEXT.md` and `docs/CATALOG_MODEL.md`.
