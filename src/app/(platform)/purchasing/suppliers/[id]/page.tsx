import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { SupplierDetail } from "@/modules/suppliers/components/supplier-workspace";
import { getSupplier, listSupplierContacts } from "@/modules/suppliers/queries";

export const metadata: Metadata = {
  title: "Supplier detail",
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("purchasing.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  let supplier;
  try {
    supplier = await getSupplier(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const contacts = await listSupplierContacts(id);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Purchasing</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Supplier</h1>
        </div>
        <Button href="/purchasing/suppliers" variant="ghost">
          Back to suppliers
        </Button>
      </div>
      <SupplierDetail
        supplier={supplier}
        contacts={contacts}
        canManage={can(tenant, "purchasing.manage")}
      />
    </section>
  );
}
