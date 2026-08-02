# Nolt Inventory

Multi-tenant inventory operations platform by NolTurn Solutions.

**Version 1.0 Release Candidate** — Phases 1–3.6: identity, catalog, storage, ledger, movements, counts, purchasing, lots, recalls, reorder/restock, and operational alerts.

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
Bootstrap seeds demo catalog, storage hierarchies, and an opening balance per primary location.

## Verification

```bash
npm run verify
npm run test:rls
npm run test:e2e
```

## Documentation

| Doc | Purpose |
| --- | --- |
| [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md) | What exists today |
| [docs/V1_RELEASE_REVIEW.md](docs/V1_RELEASE_REVIEW.md) | V1 RC architecture, security, UX, debt |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased plan and 1.1 recommendations |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System shape |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | AuthZ / RLS |
| [docs/INVENTORY_LEDGER.md](docs/INVENTORY_LEDGER.md) | Ledger rules |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Tables and RPCs |
