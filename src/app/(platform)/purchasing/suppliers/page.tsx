import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listSuppliers } from "@/modules/suppliers/queries";
import { CreateSupplierForm } from "@/modules/suppliers/components/supplier-workspace";

export const metadata: Metadata = {
  title: "Suppliers",
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("purchasing.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const suppliers = await listSuppliers();
  const showCreate = params.new === "1" && can(tenant, "purchasing.manage");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Purchasing</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Suppliers</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(tenant, "purchasing.manage") ? (
            <Button href="/purchasing/suppliers?new=1">New supplier</Button>
          ) : null}
          <Button href="/purchasing" variant="ghost">
            Back
          </Button>
        </div>
      </div>

      {showCreate ? <CreateSupplierForm canManage={can(tenant, "purchasing.manage")} /> : null}

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id} className="border-b border-border/70">
                <td className="px-3 py-2">{supplier.name}</td>
                <td className="px-3 py-2 capitalize">{supplier.status}</td>
                <td className="px-3 py-2 text-muted">{supplier.email || "—"}</td>
                <td className="px-3 py-2 text-muted">{supplier.phone || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button href={`/purchasing/suppliers/${supplier.id}`} variant="ghost">
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  No suppliers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
