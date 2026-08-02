import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { administrationNav } from "@/config/app";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Administration",
};

export default async function AdministrationPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("organization.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const supabase = await createServerSupabaseClient();
  const { data: organizationRaw } = await supabase
    .from("organizations")
    .select("id, name, slug, status, timezone, created_at")
    .eq("id", tenant.organizationId)
    .single();

  const organization = organizationRaw as {
    id: string;
    name: string;
    slug: string;
    status: string;
    timezone: string;
    created_at: string;
  } | null;

  const links = administrationNav.filter((item) =>
    item.anyOfPermissions?.some((key) => tenant.permissionKeys.includes(key)),
  );

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Administration</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Organization</h1>
        <p className="text-muted">Tenant profile and administration entry points.</p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Name</dt>
          <dd className="mt-1 font-medium">{organization?.name}</dd>
        </div>
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Slug</dt>
          <dd className="mt-1 font-medium">{organization?.slug}</dd>
        </div>
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
          <dd className="mt-1 font-medium">{organization?.status}</dd>
        </div>
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Timezone</dt>
          <dd className="mt-1 font-medium">{organization?.timezone}</dd>
        </div>
      </dl>

      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block border border-border bg-surface p-4 hover:border-accent"
            >
              <span className="font-medium">{item.label}</span>
              <span className="mt-1 block text-sm text-muted">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
