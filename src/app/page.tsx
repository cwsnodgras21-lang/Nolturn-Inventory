import Link from "next/link";
import { BrandMark, PhaseBadge } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-8">
        <BrandMark />
        <div className="flex items-center gap-3">
          <PhaseBadge />
          <Button href="/login" variant="secondary">
            Sign in
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-4 py-16 sm:px-8">
        <div className="space-y-5">
          <p className="text-sm uppercase tracking-[0.18em] text-accent">{appConfig.company}</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {appConfig.name}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            Secure multi-tenant inventory operations — catalog, storage, ledger movements, counts,
            purchasing, lots, recalls, restock planning, and operational alerts.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button href="/login">Sign in</Button>
          <Button href="/dashboard" variant="secondary">
            Open dashboard
          </Button>
        </div>

        <dl className="grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-foreground">Version 1.0 RC</dt>
            <dd className="mt-1 text-sm text-muted">
              Production-ready core through Phase 3.6 operational alerts.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-foreground">Not in V1</dt>
            <dd className="mt-1 text-sm text-muted">
              Billing, document signing, Nolt intelligence, forecasting, and alert delivery channels.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-foreground">Docs</dt>
            <dd className="mt-1 text-sm text-muted">
              See{" "}
              <Link href="/dashboard" className="text-accent hover:text-accent-hover">
                platform shell
              </Link>{" "}
              after signing in, or{" "}
              <span className="text-foreground">docs/V1_RELEASE_REVIEW.md</span>.
            </dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
