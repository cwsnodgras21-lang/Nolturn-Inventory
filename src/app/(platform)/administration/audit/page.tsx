import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { listAuditEvents } from "@/modules/audit";

export const metadata: Metadata = {
  title: "Audit log",
};

export default async function AuditAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("audit.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const events = await listAuditEvents(tenant.organizationId);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Audit</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted">
          Append-only application events. Updates and deletes are blocked by RLS.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted">No audit events yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {events.map((event) => (
            <li key={event.id} className="bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{event.action}</p>
                <time className="text-xs text-muted">
                  {new Date(event.created_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-sm text-muted">
                {event.summary || `${event.entity_type} ${event.entity_id ?? ""}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
