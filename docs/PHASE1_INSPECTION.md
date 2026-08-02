# Phase 1 inspection notes

**Date:** 2026-08-02

## Matches Phase 0 documentation

- Scaffold-only app: branded shell, planned placeholders, no tenancy/inventory/billing/Nolt code.
- ADRs 0001–0012 present and aligned with modular monolith + RLS + Supabase Auth.
- Domain stubs under `src/modules/*` ready for Phase 1 ownership.

## Contradictions (resolved toward ADRs / Phase 1 spec)

| Issue | Resolution |
| --- | --- |
| `TENANCY_MODEL.md` shows `role_id` on memberships | Use `membership_roles` junction (Phase 1). Update tenancy docs. |
| `.env.example` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` only | Central env resolver prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falls back to anon. |
| `config.toml` seeds `./seed.sql` but only `seed/README.md` exists | Add `supabase/seed.sql` + bootstrap script for Auth users. |
| SECURITY_MODEL lists NolTurn Support as a role | Do **not** seed as tenant role (ADR-0012). Document separately. |

## Missing prerequisites for Phase 1

- `@supabase/ssr`, `@supabase/supabase-js`, `server-only`
- Migrations, RLS helpers, permission catalog
- Middleware session refresh
- Local `.env.local` (not present)
- Local Supabase stack for this project (another stack may already be running)

## Domains / files to modify

- `src/lib/supabase/*`, `src/lib/env.ts`, `src/lib/auth/*`, `src/lib/permissions/*`
- `src/modules/{identity,organizations,locations,audit}/*`
- `src/app/(auth)/*`, `src/app/(platform)/*`, proxy/middleware
- `supabase/migrations/*`, `supabase/seed.sql`, `supabase/tests/*`
- Docs, `.env.example`, `package.json`, CI
