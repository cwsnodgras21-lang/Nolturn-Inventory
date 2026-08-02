import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listCountSessions } from "@/modules/counts/queries";
import { COUNT_SESSION_STATUSES, type CountSessionStatus } from "@/modules/counts/types";

export const metadata: Metadata = {
  title: "Inventory counts",
};

function parseStatus(value: string | undefined): CountSessionStatus | "all" {
  if (!value || value === "all") return "all";
  return (COUNT_SESSION_STATUSES as readonly string[]).includes(value)
    ? (value as CountSessionStatus)
    : "all";
}

export default async function InventoryCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.count.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const status = parseStatus(params.status);
  const sessions = await listCountSessions({ status });

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Counts</h1>
          <p className="text-muted">
            Physical inventory counts with frozen expected quantities and ledger-backed reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(tenant, "inventory.count.perform") ? (
            <Button href="/inventory/counts/new">New count</Button>
          ) : null}
          <Button href="/inventory" variant="ghost">
            Back
          </Button>
        </div>
      </div>

      <form method="get" className="flex flex-wrap gap-3">
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {COUNT_SESSION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Locations</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} className="border-b border-border/70">
                <td className="px-3 py-2">
                  {session.name}
                  {session.blindCountEnabled ? (
                    <span className="ml-2 text-xs text-muted">Blind</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 capitalize">{session.status.replaceAll("_", " ")}</td>
                <td className="px-3 py-2 text-muted">
                  {(session.locationNames ?? []).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-muted">
                  {new Date(session.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button href={`/inventory/counts/${session.id}`} variant="ghost">
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  No count sessions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
